import { execFile, spawn as nodeSpawn } from "node:child_process";
import type { Logger } from "../log";
import { BYTES_PER_SAMPLE, DEVICE_SAMPLE_RATE, FrameChunker, rmsLevel, toWav } from "./pcm";

/**
 * A microphone of the Mac running the bridge (the built-in one, a DJI
 * receiver on USB-C…), captured with ffmpeg's avfoundation input as 16 kHz
 * PCM16 mono — the same frames a board streams. macOS only: Docker Desktop's
 * VM has no sound device, so in a container this reports `unavailable`.
 *
 * It stays open while selected (no open latency, no clipped first word; an
 * unplugged receiver is noticed at once) and restarts with backoff when ffmpeg
 * dies. Inputs are picked by NAME: avfoundation's indexes shift when a device
 * is plugged in, and the first one is often a virtual mic (Krisp, Teams…).
 */

export type HostMicChannel = "L" | "R" | "mix";
/** `off`: nothing selected · `no-signal`: digital silence for 3 s (denied Microphone permission, a muted receiver). */
export type HostMicHealth = "off" | "starting" | "open" | "no-signal" | "gone" | "unavailable";

export interface HostMicStatus {
  /** The input in use (or wanted, when it is not there). */
  name: string | null;
  channel: HostMicChannel;
  health: HostMicHealth;
  /** Why it is not open, for the settings page. */
  detail?: string;
}

const FRAME_BYTES = (DEVICE_SAMPLE_RATE * BYTES_PER_SAMPLE * 20) / 1000; // 640 B = 20 ms, the board's frame
const SILENT_MS = 3_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];
const LIST_CACHE_MS = 10_000;

/** Audio input names from `ffmpeg -f avfoundation -list_devices true -i ""` (it prints them on stderr). */
export function parseAvfoundationAudio(stderr: string): string[] {
  const lines = stderr.split("\n");
  const start = lines.findIndex((line) => line.includes("AVFoundation audio devices:"));
  if (start < 0) return [];
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^\[AVFoundation[^\]]*\]\s+\[\d+\]\s+(.+?)\s*$/.exec(line);
    if (!match) break;
    names.push(match[1]);
  }
  return names;
}

/**
 * Exact name first (case-insensitive), then a substring ("Wireless"); nothing wanted = the built-in mic.
 * "DJI" also finds a DJI receiver (Mic 2, Mic Mini), which calls itself «Wireless Microphone RX».
 */
export function pickHostMic(available: string[], wanted?: string | null): string | null {
  const want = wanted?.trim().toLowerCase();
  if (want) {
    return (
      available.find((name) => name.toLowerCase() === want) ??
      available.find((name) => name.toLowerCase().includes(want)) ??
      (want === "dji" ? available.find((name) => /wireless microphone/i.test(name)) : undefined) ??
      null
    );
  }
  return available.find((name) => /macbook.*micro|built-in micro|micr[oó]fono (integrado|de (la )?macbook)/i.test(name)) ?? null;
}

/**
 * The capture command. Every input is first made stereo (a mono mic lands on
 * both sides), so L / R / mix never fail on a mono device; a DJI receiver in
 * stereo mode puts one transmitter on each side.
 */
export function ffmpegArgs(name: string, channel: HostMicChannel): string[] {
  const pan = channel === "mix" ? "0.5*c0+0.5*c1" : channel === "L" ? "c0" : "c1";
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-f",
    "avfoundation",
    "-i",
    `:${name}`,
    "-af",
    `aformat=channel_layouts=stereo,pan=mono|c0=${pan}`,
    "-ar",
    String(DEVICE_SAMPLE_RATE),
    "-f",
    "s16le",
    "pipe:1",
  ];
}

/** Lists avfoundation audio inputs; throws `ENOENT` when there is no ffmpeg. */
export function listHostMics(ffmpeg = "ffmpeg"): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // It always exits 1 here (the empty input "fails"): the list is in stderr either way.
    execFile(ffmpeg, ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], (error, _out, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") return reject(error);
      resolve(parseAvfoundationAudio(String(stderr)));
    });
  });
}

/** What HostMic needs from a child process (the real one, or a test fake). */
export interface MicProcess {
  stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  on(event: "exit", listener: (code: number | null, signal: string | null) => void): unknown;
  on(event: "error", listener: (error: NodeJS.ErrnoException) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

export interface HostMicOptions {
  logger: Logger;
  ffmpeg?: string;
  /** Wanted input (name or part of it); unset = the built-in mic once something asks for it. */
  name?: string | null;
  channel?: HostMicChannel;
  platform?: NodeJS.Platform;
  spawn?: (command: string, args: string[]) => MicProcess;
  list?: () => Promise<string[]>;
  now?: () => number;
}

export class HostMic {
  private child: MicProcess | null = null;
  private opening = false;
  private closed = false;
  private readonly listeners = new Set<(pcm16k: Buffer) => void>();
  private chunker = new FrameChunker(FRAME_BYTES);
  private health: HostMicHealth = "off";
  private detail: string | undefined;
  private wanted: string | null;
  private channel: HostMicChannel;
  private using: string | null = null;
  private silentSince = 0;
  private attempt = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private listCache: { at: number; names: string[] } | null = null;
  private readonly log: Logger;
  private readonly now: () => number;

  constructor(private readonly options: HostMicOptions) {
    this.log = options.logger;
    this.wanted = options.name?.trim() || null;
    this.channel = options.channel ?? "mix";
    this.now = options.now ?? Date.now;
    if ((options.platform ?? process.platform) !== "darwin") {
      this.setHealth("unavailable", "el micrófono de la Mac solo se lee con el bridge corriendo en macOS (no en Docker)");
    } else if (this.wanted) void this.open();
  }

  status(): HostMicStatus {
    return {
      name: this.using ?? this.wanted,
      channel: this.channel,
      health: this.health,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }

  /** Frames are flowing and they are not digital silence. */
  get ready(): boolean {
    return this.health === "open";
  }

  /** The inputs ffmpeg sees, cached for 10 s (the settings page polls). */
  async devices(fresh = false): Promise<string[]> {
    if ((this.options.platform ?? process.platform) !== "darwin") return [];
    if (!fresh && this.listCache && this.now() - this.listCache.at < LIST_CACHE_MS) return this.listCache.names;
    try {
      const names = await (this.options.list ?? (() => listHostMics(this.options.ffmpeg)))();
      this.listCache = { at: this.now(), names };
      return names;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        this.setHealth("unavailable", "no hay ffmpeg en esta máquina (brew install ffmpeg)");
      return [];
    }
  }

  /** Another input or side (from the settings page); null name = the built-in mic. Reopens the capture. */
  select(name: string | null, channel: HostMicChannel = this.channel): void {
    this.wanted = name?.trim() || null;
    this.channel = channel;
    this.using = null;
    this.stopChild();
    this.attempt = 0;
    void this.open();
  }

  /** A session's route is `host`: open it if it is not (idempotent, cheap). */
  ensureOpen(): void {
    if (!this.child && !this.opening && !this.restartTimer && this.health !== "unavailable") void this.open();
  }

  /** Every 20 ms frame, whoever is listening; returns the unsubscribe. */
  onPcm(listener: (pcm16k: Buffer) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Records `ms` of audio: the venue check (`companion:mic-check`, the settings page's «Probar»). */
  async probe(ms: number): Promise<{ peak: number; rms: number; seconds: number; health: HostMicHealth; wav: Buffer }> {
    this.ensureOpen();
    const frames: Buffer[] = [];
    let peak = 0;
    let sum = 0;
    const off = this.onPcm((pcm) => {
      frames.push(pcm);
      const level = rmsLevel(pcm);
      peak = Math.max(peak, level);
      sum += level * level;
    });
    await new Promise((resolve) => setTimeout(resolve, ms));
    off();
    const pcm = Buffer.concat(frames);
    return {
      peak,
      rms: frames.length ? Math.sqrt(sum / frames.length) : 0,
      seconds: pcm.length / (DEVICE_SAMPLE_RATE * BYTES_PER_SAMPLE),
      health: this.health,
      wav: toWav(pcm, DEVICE_SAMPLE_RATE),
    };
  }

  close(): void {
    this.closed = true;
    this.stopChild();
    this.listeners.clear();
  }

  private async open(): Promise<void> {
    if (this.closed || this.child || this.opening || this.health === "unavailable") return;
    this.opening = true;
    try {
      const names = await this.devices(true);
      if (this.closed || this.child || (this.health as HostMicHealth) === "unavailable") return;
      const name = pickHostMic(names, this.wanted);
      if (!name) {
        this.setHealth("gone", `no veo «${this.wanted ?? "el micrófono integrado"}» (hay: ${names.join(", ") || "ninguno"})`);
        return this.scheduleRestart();
      }
      this.using = name;
      this.silentSince = 0;
      this.chunker = new FrameChunker(FRAME_BYTES);
      const child = (this.options.spawn ?? defaultSpawn)(this.options.ffmpeg ?? "ffmpeg", ffmpegArgs(name, this.channel));
      this.child = child;
      this.setHealth("starting");
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-400);
      });
      child.stdout?.on("data", (chunk) => {
        if (this.child === child) this.onData(chunk);
      });
      child.on("error", (error) => {
        if (this.child !== child) return;
        this.child = null;
        if (error.code === "ENOENT") this.setHealth("unavailable", "no hay ffmpeg en esta máquina (brew install ffmpeg)");
        else {
          this.setHealth("gone", error.message);
          this.scheduleRestart();
        }
      });
      child.on("exit", (code, signal) => {
        if (this.child !== child) return;
        this.child = null;
        this.setHealth("gone", stderr.trim().split("\n").at(-1) || `ffmpeg terminó (${code ?? signal})`);
        this.scheduleRestart();
      });
    } finally {
      this.opening = false;
    }
  }

  private onData(chunk: Buffer): void {
    for (const frame of this.chunker.push(chunk)) {
      const silent = isDigitalSilence(frame);
      if (!silent) {
        this.silentSince = 0;
        this.attempt = 0;
        if (this.health !== "open") this.setHealth("open");
      } else {
        this.silentSince ||= this.now();
        if (this.health !== "no-signal" && this.now() - this.silentSince >= SILENT_MS)
          this.setHealth("no-signal", "llega silencio digital: ¿permiso de Micrófono para la terminal? ¿receptor apagado o muteado?");
      }
      for (const listener of this.listeners) listener(frame);
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

  private stopChild(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.child;
    this.child = null;
    child?.kill("SIGTERM");
    if (this.health !== "unavailable") this.setHealth("off");
  }

  private setHealth(health: HostMicHealth, detail?: string): void {
    const changed = health !== this.health;
    this.health = health;
    this.detail = health === "open" || health === "starting" || health === "off" ? undefined : detail;
    if (!changed) return;
    const what = `mic de la Mac${this.using ? ` «${this.using}»` : ""}`;
    if (health === "open") this.log.info(`${what}: abierto (${this.channel})`);
    else if (health === "gone" || health === "no-signal") this.log.warn(`${what}: ${health}${detail ? ` — ${detail}` : ""}`);
    else if (health === "unavailable") this.log.info(`${what}: no disponible — ${detail}`);
  }
}

/** Exactly zero, every sample: what a denied Microphone permission (or a muted digital receiver) delivers. */
function isDigitalSilence(frame: Buffer): boolean {
  for (let i = 0; i + 1 < frame.length; i += 2) if (frame.readInt16LE(i) !== 0) return false;
  return true;
}

function defaultSpawn(command: string, args: string[]): MicProcess {
  return nodeSpawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
}
