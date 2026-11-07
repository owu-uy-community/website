import type { HostSpeakerSnapshot } from "../web/contract";
import type { Logger } from "../log";
import { BACKOFF_MS, FFMPEG_MISSING, listAudioToolbox, pickByName, spawnFfmpeg, type AudioToolboxDevice, type FfmpegProcess } from "./ffmpeg";
import { BYTES_PER_SAMPLE, DEVICE_SAMPLE_RATE, rmsLevel } from "./pcm";

/**
 * The Mac's own output (the room's PA plugged into it, its speakers): the
 * `host` output route, so Owy is heard with no browser tab kept open. ffmpeg
 * plays 16 kHz PCM16 mono from stdin through CoreAudio (`-f audiotoolbox`).
 *
 * It stays open while selected and is fed silence between answers, so the
 * audio queue never runs dry (no clicks, no first syllable lost to a cold
 * start); an interrupt kills it and starts a fresh one, which drops whatever
 * was queued. macOS only: elsewhere this reports `unavailable`.
 */

export type HostSpeakerHealth = HostSpeakerSnapshot["health"];

export interface HostSpeakerOptions {
  logger: Logger;
  ffmpeg?: string;
  /** Wanted output (name or part of it); unset = the system's default output. */
  name?: string | null;
  /** ms from a frame written to it being heard (mouth and face sync; COMPANION_HOST_SPEAKER_LATENCY_MS). */
  latencyMs?: number;
  /** After Owy's audio, the room's echo: the Mac's mic stays deaf this long more (COMPANION_HOST_SPEAKER_TAIL_MS). */
  tailMs?: number;
  platform?: NodeJS.Platform;
  spawn?: (command: string, args: string[]) => FfmpegProcess;
  list?: () => Promise<AudioToolboxDevice[]>;
  now?: () => number;
}

const FRAME_BYTES = (DEVICE_SAMPLE_RATE * BYTES_PER_SAMPLE * 20) / 1000; // 640 B = 20 ms
const SILENCE = Buffer.alloc(FRAME_BYTES);
const LIST_CACHE_MS = 10_000;

export function speakerArgs(index: number): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "s16le",
    "-ar",
    String(DEVICE_SAMPLE_RATE),
    "-ac",
    "1",
    "-i",
    "pipe:0",
    "-f",
    "audiotoolbox",
    "-audio_device_index",
    String(index),
    "-",
  ];
}

export class HostSpeaker {
  private child: FfmpegProcess | null = null;
  private opening = false;
  private closed = false;
  private health: HostSpeakerHealth = "off";
  private detail: string | undefined;
  private wanted: string | null;
  private using: string | null = null;
  private attempt = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private keepAlive: NodeJS.Timeout | null = null;
  private lastWriteAt = 0;
  /** When the audio written so far (a paced answer, or a whole clip at once) ends playing; 0 = silent. */
  private soundUntil = 0;
  private listCache: { at: number; devices: AudioToolboxDevice[] } | null = null;
  private readonly log: Logger;
  private readonly now: () => number;
  latencyMs: number;
  tailMs: number;

  constructor(private readonly options: HostSpeakerOptions) {
    this.log = options.logger;
    this.wanted = options.name?.trim() || null;
    this.now = options.now ?? Date.now;
    this.latencyMs = options.latencyMs ?? 150;
    this.tailMs = options.tailMs ?? 300;
    if ((options.platform ?? process.platform) !== "darwin")
      this.setHealth("unavailable", "la salida de la Mac solo suena con el bridge corriendo en macOS");
  }

  status(available: string[] = this.listCache?.devices.map((device) => device.name) ?? []): HostSpeakerSnapshot {
    return {
      name: this.using ?? this.wanted,
      health: this.health,
      ...(this.detail ? { detail: this.detail } : {}),
      available,
    };
  }

  get ready(): boolean {
    return this.health === "open";
  }

  /** Owy is being heard from it, or was a moment ago (the room's echo): the Mac's mic shouldn't listen. */
  get busy(): boolean {
    return this.soundUntil > 0 && this.now() < this.soundUntil + this.latencyMs + this.tailMs;
  }

  /** CoreAudio devices ffmpeg sees, by name (cached 10 s; inputs are listed too). */
  async devices(fresh = false): Promise<string[]> {
    return (await this.deviceList(fresh)).map((device) => device.name);
  }

  /** Another output (from the panel); null = the system's default. Reopens the output. */
  select(name: string | null): void {
    this.wanted = name?.trim() || null;
    this.using = null;
    this.stopChild();
    this.attempt = 0;
    void this.open();
  }

  /** A device's output is `host`: open it if it is not (idempotent, cheap). */
  ensureOpen(): void {
    if (!this.child && !this.opening && !this.restartTimer && this.health !== "unavailable") void this.open();
  }

  /** One frame of Owy's audio (16 kHz PCM16 mono), paced in real time by the caller. */
  write(pcm: Buffer): void {
    const child = this.child;
    if (!child?.stdin || this.health !== "open") return;
    const now = this.now();
    this.lastWriteAt = now;
    if (rmsLevel(pcm) > 0.002)
      this.soundUntil = Math.max(this.soundUntil, now) + (pcm.length / (DEVICE_SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000;
    try {
      child.stdin.write(pcm);
    } catch (error) {
      this.log.warn("salida de la Mac: no pude escribir", error);
    }
  }

  /** Drops whatever is queued (a tap, «Callar», a new turn): a fresh ffmpeg, right away. */
  flush(): void {
    if (!this.child) return;
    this.soundUntil = 0;
    this.stopChild();
    this.attempt = 0;
    void this.open();
  }

  close(): void {
    this.closed = true;
    this.stopChild();
  }

  private async deviceList(fresh: boolean): Promise<AudioToolboxDevice[]> {
    if ((this.options.platform ?? process.platform) !== "darwin") return [];
    if (!fresh && this.listCache && this.now() - this.listCache.at < LIST_CACHE_MS) return this.listCache.devices;
    try {
      const devices = await (this.options.list ?? (() => listAudioToolbox(this.options.ffmpeg)))();
      this.listCache = { at: this.now(), devices };
      return devices;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") this.setHealth("unavailable", FFMPEG_MISSING);
      return [];
    }
  }

  private async open(): Promise<void> {
    if (this.closed || this.child || this.opening || this.health === "unavailable") return;
    this.opening = true;
    try {
      let index = -1;
      if (this.wanted) {
        const devices = await this.deviceList(true);
        if (this.closed || this.child || (this.health as HostSpeakerHealth) === "unavailable") return;
        const name = pickByName(
          devices.map((device) => device.name),
          this.wanted
        );
        const device = devices.find((candidate) => candidate.name === name);
        if (!device) {
          this.setHealth("gone", `no veo «${this.wanted}» (hay: ${devices.map((d) => d.name).join(", ") || "ninguna"})`);
          return this.scheduleRestart();
        }
        index = device.index;
        this.using = device.name;
      } else this.using = null;
      const child = (this.options.spawn ?? ((command, args) => spawnFfmpeg(command, args, ["pipe", "ignore", "pipe"])))(
        this.options.ffmpeg ?? "ffmpeg",
        speakerArgs(index)
      );
      this.child = child;
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-400);
      });
      // A pipe closed under us (ffmpeg died) is reported by `exit`; never let it throw.
      child.stdin?.on("error", () => {});
      child.on("error", (error) => {
        if (this.child !== child) return;
        this.child = null;
        this.stopKeepAlive();
        if (error.code === "ENOENT") this.setHealth("unavailable", FFMPEG_MISSING);
        else {
          this.setHealth("gone", error.message);
          this.scheduleRestart();
        }
      });
      child.on("exit", (code, signal) => {
        if (this.child !== child) return;
        this.child = null;
        this.stopKeepAlive();
        this.setHealth("gone", stderr.trim().split("\n").at(-1) || `ffmpeg terminó (${code ?? signal})`);
        this.scheduleRestart();
      });
      this.setHealth("open");
      this.attempt = 0;
      // Silence between answers keeps CoreAudio's queue running.
      this.keepAlive = setInterval(() => {
        if (this.child === child && this.now() - this.lastWriteAt >= 40) {
          this.lastWriteAt = this.now();
          child.stdin?.write(SILENCE);
        }
      }, 20);
      this.keepAlive.unref?.();
    } finally {
      this.opening = false;
    }
  }

  private scheduleRestart(): void {
    if (this.closed || this.restartTimer) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt++;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.open();
    }, delay);
  }

  private stopKeepAlive(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }

  private stopChild(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.stopKeepAlive();
    const child = this.child;
    this.child = null;
    child?.kill("SIGKILL");
    if (this.health !== "unavailable") this.setHealth("off");
  }

  private setHealth(health: HostSpeakerHealth, detail?: string): void {
    const changed = health !== this.health;
    this.health = health;
    this.detail = health === "open" || health === "starting" || health === "off" ? undefined : detail;
    if (!changed) return;
    const what = `salida de la Mac «${this.using ?? this.wanted ?? "la del sistema"}»`;
    if (health === "open") this.log.info(`${what}: abierta`);
    else if (health === "gone") this.log.warn(`${what}: ${health}${detail ? ` — ${detail}` : ""}`);
    else if (health === "unavailable") this.log.info(`${what}: no disponible — ${detail}`);
  }
}
