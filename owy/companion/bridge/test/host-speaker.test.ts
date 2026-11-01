import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseAudioToolbox } from "../src/audio/ffmpeg";
import { HostSpeaker, speakerArgs } from "../src/audio/host-speaker";
import { RouteLink } from "../src/device/route-link";
import { createLogger } from "../src/log";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const logger = createLogger("test", "error");

class FakeFfmpeg extends EventEmitter {
  written: Buffer[] = [];
  killed: string | null = null;
  stdin = { write: (chunk: Buffer) => (this.written.push(chunk), true), on: () => {} };
  stdout = null;
  stderr = new EventEmitter();
  kill(signal?: string) {
    this.killed = signal ?? "SIGTERM";
  }
}

function speaker(options: { name?: string; platform?: NodeJS.Platform } = {}) {
  const spawned: { args: string[]; child: FakeFfmpeg }[] = [];
  const instance = new HostSpeaker({
    logger,
    name: options.name ?? null,
    latencyMs: 150,
    tailMs: 300,
    platform: options.platform ?? "darwin",
    list: async () => [
      { index: 0, name: "MacBook Pro Microphone", uid: "BuiltInMicrophoneDevice" },
      { index: 1, name: "MacBook Pro Speakers", uid: "BuiltInSpeakerDevice" },
      { index: 4, name: "USB Audio CODEC", uid: "AppleUSBAudioEngine:1" },
    ],
    spawn: (_command, args) => {
      const child = new FakeFfmpeg();
      spawned.push({ args, child });
      return child as never;
    },
  });
  return { instance, spawned };
}

const loud = () => {
  const pcm = Buffer.alloc(640);
  for (let i = 0; i < 320; i++) pcm.writeInt16LE(8000, i * 2);
  return pcm;
};

it("parses ffmpeg's CoreAudio list (inputs and outputs share one index space)", () => {
  const stderr = `Press [q] to stop
[AudioToolbox @ 0xabd01c3c0] CoreAudio devices:
[AudioToolbox @ 0xabd01c3c0] [0]         MacBook Pro Microphone, BuiltInMicrophoneDevice
[AudioToolbox @ 0xabd01c3c0] [1]           MacBook Pro Speakers, BuiltInSpeakerDevice
Output #0, audiotoolbox, to 'pipe:':`;
  expect(parseAudioToolbox(stderr)).toEqual([
    { index: 0, name: "MacBook Pro Microphone", uid: "BuiltInMicrophoneDevice" },
    { index: 1, name: "MacBook Pro Speakers", uid: "BuiltInSpeakerDevice" },
  ]);
});

it("is unavailable outside macOS (Docker)", () => {
  const { instance } = speaker({ platform: "linux" });
  instance.ensureOpen();
  expect(instance.ready).toBe(false);
  expect(instance.status().health).toBe("unavailable");
});

it("opens the system's output, or a named one by its index, and keeps it fed with silence", async () => {
  const system = speaker();
  system.instance.ensureOpen();
  await vi.advanceTimersByTimeAsync(0);
  expect(system.spawned[0].args).toEqual(speakerArgs(-1));
  expect(system.instance.ready).toBe(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(system.spawned[0].child.written.length).toBeGreaterThan(0);
  expect(system.spawned[0].child.written.every((chunk) => chunk.every((byte) => byte === 0))).toBe(true);

  const named = speaker({ name: "usb" });
  named.instance.ensureOpen();
  await vi.advanceTimersByTimeAsync(0);
  expect(named.spawned[0].args).toEqual(speakerArgs(4));
  expect(named.instance.status().name).toBe("USB Audio CODEC");
});

it("is busy while Owy's audio plays and for the room's echo after it; a flush drops the queue", async () => {
  const { instance, spawned } = speaker();
  instance.ensureOpen();
  await vi.advanceTimersByTimeAsync(0);
  expect(instance.busy).toBe(false);
  for (let i = 0; i < 50; i++) instance.write(loud()); // 1 s written at once (a clip)
  expect(instance.busy).toBe(true);
  await vi.advanceTimersByTimeAsync(1000 + 150 + 299);
  expect(instance.busy).toBe(true);
  await vi.advanceTimersByTimeAsync(2);
  expect(instance.busy).toBe(false);

  instance.write(loud());
  instance.flush();
  expect(spawned[0].child.killed).toBe("SIGKILL");
  await vi.advanceTimersByTimeAsync(0);
  expect(spawned).toHaveLength(2);
  expect(instance.busy).toBe(false);
});

it("restarts with backoff when ffmpeg dies", async () => {
  const { instance, spawned } = speaker();
  instance.ensureOpen();
  await vi.advanceTimersByTimeAsync(0);
  spawned[0].child.emit("exit", 1, null);
  expect(instance.status().health).toBe("gone");
  await vi.advanceTimersByTimeAsync(1000);
  expect(spawned).toHaveLength(2);
  expect(instance.ready).toBe(true);
});

it("routes a turn's audio to the Mac, then the browser, then the board, frame by frame", () => {
  const device = { sendEvent: vi.fn(), sendAudio: vi.fn(), isPlaybackReady: () => true };
  const peer = { sendEvent: vi.fn(), sendAudio: vi.fn() };
  const host = { ready: true, write: vi.fn() };
  let output: "device" | "laptop" | "host" = "host";
  let attached: typeof peer | null = peer;
  const link = new RouteLink({
    device: device as never,
    peer: () => attached as never,
    host: () => host as never,
    output: () => output,
  });
  link.sendEvent(1 as never);
  expect(device.sendEvent).toHaveBeenCalledOnce();
  expect(peer.sendEvent).toHaveBeenCalledOnce();

  link.sendAudio(Buffer.alloc(4));
  expect(host.write).toHaveBeenCalledOnce();
  host.ready = false; // the PA was unplugged mid-answer
  link.sendAudio(Buffer.alloc(4));
  expect(peer.sendAudio).toHaveBeenCalledOnce();
  attached = null; // and the tab closed
  link.sendAudio(Buffer.alloc(4));
  expect(device.sendAudio).toHaveBeenCalledOnce();
  output = "device";
  host.ready = true;
  link.sendAudio(Buffer.alloc(4));
  expect(device.sendAudio).toHaveBeenCalledTimes(2);
  expect(host.write).toHaveBeenCalledOnce();
});
