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
    // CoreAudio gives some devices (Bluetooth, Continuity) no name here: they can't be picked by one.
    if (match[2] === "(null)") continue;
    devices.push({ index: Number(match[1]), name: match[2], uid: match[3] });
  }
  return devices;
}

/** What macOS says about its audio devices: which can record, which can play, and the defaults. */
export interface CoreAudioDevices {
  inputs: string[];
  outputs: string[];
  defaultInput: string | null;
  defaultOutput: string | null;
}

/**
 * `system_profiler SPAudioDataType -json`: ffmpeg lists microphones and speakers in one index
 * space, with no direction; macOS knows each device's channels and which ones are the defaults.
 */
export function parseCoreAudio(json: string): CoreAudioDevices {
  const devices: CoreAudioDevices = { inputs: [], outputs: [], defaultInput: null, defaultOutput: null };
  let data: { SPAudioDataType?: { _items?: Record<string, unknown>[] }[] };
  try {
    data = JSON.parse(json) as typeof data;
  } catch {
    return devices;
  }
  for (const device of (data.SPAudioDataType ?? []).flatMap((group) => group._items ?? [])) {
    const name = typeof device._name === "string" ? device._name : null;
    if (!name) continue;
    if (Number(device.coreaudio_device_input) > 0 && !devices.inputs.includes(name)) devices.inputs.push(name);
    if (Number(device.coreaudio_device_output) > 0 && !devices.outputs.includes(name)) devices.outputs.push(name);
    if (device.coreaudio_default_audio_input_device === "spaudio_yes") devices.defaultInput = name;
    if (device.coreaudio_default_audio_output_device === "spaudio_yes") devices.defaultOutput = name;
  }
  return devices;
}

/** The Mac's audio devices by direction (~0.1 s); null off macOS or when it can't tell. */
export function listCoreAudio(): Promise<CoreAudioDevices | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile("/usr/sbin/system_profiler", ["SPAudioDataType", "-json"], { timeout: 5_000, maxBuffer: 1024 * 1024 }, (error, stdout) =>
      resolve(error ? null : parseCoreAudio(String(stdout)))
    );
  });
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
