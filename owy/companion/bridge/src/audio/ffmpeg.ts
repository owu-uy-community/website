import { execFile, spawn as nodeSpawn, type StdioOptions } from "node:child_process";

/**
 * What the Mac's microphone (host-mic.ts) and its speaker (host-speaker.ts) share: ffmpeg as a
 * child process, devices picked by NAME (indexes shift when something is plugged in), and the
 * same backoff when ffmpeg dies.
 */

/** Waits between restarts of a dead ffmpeg, the last one repeated. */
export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];

export const FFMPEG_MISSING = "no hay ffmpeg en esta máquina (brew install ffmpeg)";

/** Exact name first (case-insensitive), then a substring; null when nothing matches. */
export function pickByName(available: string[], wanted: string): string | null {
  const want = wanted.trim().toLowerCase();
  return (
    available.find((name) => name.toLowerCase() === want) ??
    available.find((name) => name.toLowerCase().includes(want)) ??
    null
  );
}

/** A CoreAudio device as ffmpeg's audiotoolbox output lists it (inputs and outputs share one index space). */
export interface AudioToolboxDevice {
  index: number;
  name: string;
  uid: string;
}

/** Devices from `ffmpeg … -f audiotoolbox -list_devices true -` (stderr). */
export function parseAudioToolbox(stderr: string): AudioToolboxDevice[] {
  const lines = stderr.split("\n");
  const start = lines.findIndex((line) => line.includes("CoreAudio devices:"));
  if (start < 0) return [];
  const devices: AudioToolboxDevice[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^\[AudioToolbox[^\]]*\]\s+\[(\d+)\]\s+(.+?),\s*(\S+)\s*$/.exec(line);
    if (!match) break;
    devices.push({ index: Number(match[1]), name: match[2], uid: match[3] });
  }
  return devices;
}

/** Lists CoreAudio devices; throws `ENOENT` when there is no ffmpeg. */
export function listAudioToolbox(ffmpeg = "ffmpeg"): Promise<AudioToolboxDevice[]> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      ["-hide_banner", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "0.01", "-f", "audiotoolbox", "-list_devices", "true", "-"],
      { timeout: 10_000 },
      (error, _out, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") return reject(error);
        resolve(parseAudioToolbox(String(stderr)));
      }
    );
  });
}

/** What the mic and the speaker need from a child process (the real one, or a test fake). */
export interface FfmpegProcess {
  stdin?: { write(chunk: Buffer): boolean; on(event: "error", listener: (error: Error) => void): unknown } | null;
  stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  on(event: "exit", listener: (code: number | null, signal: string | null) => void): unknown;
  on(event: "error", listener: (error: NodeJS.ErrnoException) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

export function spawnFfmpeg(command: string, args: string[], stdio: StdioOptions = ["ignore", "pipe", "pipe"]): FfmpegProcess {
  return nodeSpawn(command, args, { stdio }) as unknown as FfmpegProcess;
}
