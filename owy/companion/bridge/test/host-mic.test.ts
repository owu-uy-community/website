import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostMic, ffmpegArgs, parseAvfoundationAudio, pickHostMic, type MicProcess } from "../src/audio/host-mic";
import { createLogger } from "../src/log";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const LIST = `[AVFoundation indev @ 0x83b00c140] AVFoundation video devices:
[AVFoundation indev @ 0x83b00c140] [0] MacBook Pro Camera
[AVFoundation indev @ 0x83b00c140] [1] Capture screen 0
[AVFoundation indev @ 0x83b00c140] AVFoundation audio devices:
[AVFoundation indev @ 0x83b00c140] [0] krisp microphone
[AVFoundation indev @ 0x83b00c140] [1] MacBook Pro Microphone
[AVFoundation indev @ 0x83b00c140] [2] DJI Mic 2
[AVFoundation indev @ 0x83b00c140] [3] Agustín’s iPhone Microphone
[in#0 @ 0x83b00c000] Error opening input: Input/output error
Error opening input file .`;

it("reads avfoundation's audio inputs by name, and picks one by name, by part of it, or the built-in", () => {
  const names = parseAvfoundationAudio(LIST);
  expect(names).toEqual(["krisp microphone", "MacBook Pro Microphone", "DJI Mic 2", "Agustín’s iPhone Microphone"]);
  expect(parseAvfoundationAudio("no devices here")).toEqual([]);
  expect(pickHostMic(names, "dji mic 2")).toBe("DJI Mic 2");
  expect(pickHostMic(names, "DJI")).toBe("DJI Mic 2");
  // Not the first in the list (a virtual mic): the built-in one.
  expect(pickHostMic(names, null)).toBe("MacBook Pro Microphone");
  expect(pickHostMic(names, "Rode")).toBeNull();
});

it("captures 16 kHz mono from the chosen side of the input", () => {
  const args = ffmpegArgs("DJI Mic 2", "R");
  expect(args.slice(args.indexOf("-i"), args.indexOf("-i") + 2)).toEqual(["-i", ":DJI Mic 2"]);
  expect(args).toContain("aformat=channel_layouts=stereo,pan=mono|c0=c1");
  expect(ffmpegArgs("x", "L")).toContain("aformat=channel_layouts=stereo,pan=mono|c0=c0");
  expect(ffmpegArgs("x", "mix")).toContain("aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0+0.5*c1");
  expect(args.slice(-5)).toEqual(["-ar", "16000", "-f", "s16le", "pipe:1"]);
});

function fakeProcess() {
  const events = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = {
    stdout,
    stderr,
    on: (event: string, listener: Parameters<EventEmitter["on"]>[1]) => events.on(event, listener),
    kill: vi.fn(),
    emit: (event: string, ...args: unknown[]) => events.emit(event, ...args),
  };
  return child;
}

function mic(options: { names?: string[]; platform?: NodeJS.Platform } = {}) {
  const children: ReturnType<typeof fakeProcess>[] = [];
  const spawn = vi.fn((_command: string, _args: string[]) => {
    const child = fakeProcess();
    children.push(child);
    return child as unknown as MicProcess;
  });
  const host = new HostMic({
    logger: createLogger("mic-test", "error"),
    platform: options.platform ?? "darwin",
    spawn,
    list: async () => options.names ?? ["krisp microphone", "MacBook Pro Microphone", "DJI Mic 2"],
  });
  return { host, spawn, children };
}

const voice = (ms: number) => {
  const pcm = Buffer.alloc((ms / 1000) * 32_000);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 3) * 4000), i * 2);
  return pcm;
};

it("opens the input when asked, hands out 20 ms frames, and is ready once real audio flows", async () => {
  const { host, spawn, children } = mic();
  expect(host.status().health).toBe("off"); // nothing wanted yet: nothing opened
  host.select("DJI");
  await vi.advanceTimersByTimeAsync(0);
  expect(spawn.mock.calls[0][1]).toContain(":DJI Mic 2");
  expect(host.status()).toMatchObject({ name: "DJI Mic 2", health: "starting" });
  expect(host.ready).toBe(false);
  const frames: Buffer[] = [];
  host.onPcm((pcm) => frames.push(pcm));
  children[0].stdout.emit("data", voice(50).subarray(0, 1000)); // arbitrary chunking from the pipe
  children[0].stdout.emit("data", voice(50).subarray(1000));
  expect(frames.map((f) => f.length)).toEqual([640, 640]);
  expect(host.ready).toBe(true);
});

it("digital silence for three seconds is «no-signal» (a denied Microphone permission), and real audio clears it", async () => {
  const { host, children } = mic();
  host.select(null);
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 160; i++) {
    children[0].stdout.emit("data", Buffer.alloc(640));
    vi.advanceTimersByTime(20);
  }
  expect(host.status()).toMatchObject({ name: "MacBook Pro Microphone", health: "no-signal" });
  expect(host.status().detail).toMatch(/permiso/);
  expect(host.ready).toBe(false);
  children[0].stdout.emit("data", voice(20));
  expect(host.ready).toBe(true);
});

it("an unplugged receiver is noticed at once and reopened with backoff; a missing one is retried too", async () => {
  const names = ["MacBook Pro Microphone", "DJI Mic 2"];
  const { host, spawn, children } = mic({ names });
  host.select("DJI");
  await vi.advanceTimersByTimeAsync(0);
  children[0].stdout.emit("data", voice(40));
  children[0].stderr.emit("data", Buffer.from("[avfoundation] device disconnected\n"));
  children[0].emit("exit", 1, null);
  expect(host.status()).toMatchObject({ health: "gone", detail: "[avfoundation] device disconnected" });
  names.pop(); // it is gone from the list too
  await vi.advanceTimersByTimeAsync(1000);
  expect(spawn).toHaveBeenCalledOnce();
  expect(host.status().detail).toMatch(/no veo «DJI»/);
  names.push("DJI Mic 2"); // plugged back in
  await vi.advanceTimersByTimeAsync(2000);
  expect(spawn).toHaveBeenCalledTimes(2);
  children[1].stdout.emit("data", voice(40));
  expect(host.ready).toBe(true);
  host.close();
  expect(children[1].kill).toHaveBeenCalled();
});

it("off macOS (Docker) or without ffmpeg it says unavailable and never spawns", async () => {
  const docker = mic({ platform: "linux" });
  docker.host.ensureOpen();
  docker.host.select("DJI");
  await vi.advanceTimersByTimeAsync(0);
  expect(docker.spawn).not.toHaveBeenCalled();
  expect(docker.host.status().health).toBe("unavailable");
  expect(await docker.host.devices()).toEqual([]);

  const noFfmpeg = new HostMic({
    logger: createLogger("mic-test", "error"),
    platform: "darwin",
    list: async () => {
      throw Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    },
  });
  noFfmpeg.ensureOpen();
  await vi.advanceTimersByTimeAsync(0);
  expect(noFfmpeg.status()).toMatchObject({ health: "unavailable", detail: expect.stringMatching(/ffmpeg/) });
});
