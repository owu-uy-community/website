import { describe, expect, it } from "vitest";
import { FrameChunker, Pcm16Resampler, bytesForMs, fromWav, rmsLevel, toWav } from "../src/audio/pcm";

function sine(samples: number, rate: number, hz: number, amplitude = 0.5): Buffer {
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * amplitude * 32767), i * 2);
  }
  return buffer;
}

describe("Pcm16Resampler", () => {
  it("produces 2/3 of the samples going 24k → 16k", () => {
    const resampler = new Pcm16Resampler(24_000, 16_000);
    const out = resampler.process(sine(2400, 24_000, 440));
    expect(Math.abs(out.length / 2 - 1600)).toBeLessThanOrEqual(2);
  });

  it("is continuous across chunk boundaries", () => {
    const input = sine(4800, 24_000, 300);
    const whole = new Pcm16Resampler(24_000, 16_000).process(input);
    const chunked = new Pcm16Resampler(24_000, 16_000);
    const a = chunked.process(input.subarray(0, 2000 * 2));
    const b = chunked.process(input.subarray(2000 * 2));
    const joined = Buffer.concat([a, b]);
    expect(Math.abs(joined.length - whole.length)).toBeLessThanOrEqual(4);
    // Same signal, same phase: compare a window well inside both outputs.
    for (let i = 100; i < 1500; i++) {
      expect(Math.abs(joined.readInt16LE(i * 2) - whole.readInt16LE(i * 2))).toBeLessThanOrEqual(2);
    }
  });

  it("passes audio through when rates match", () => {
    const input = sine(160, 16_000, 440);
    expect(new Pcm16Resampler(16_000, 16_000).process(input).equals(input)).toBe(true);
  });
});

describe("FrameChunker", () => {
  it("emits fixed frames and carries the remainder", () => {
    const chunker = new FrameChunker(8);
    expect(chunker.push(Buffer.alloc(10)).map((f) => f.length)).toEqual([8]);
    expect(chunker.pendingBytes).toBe(2);
    expect(chunker.push(Buffer.alloc(14)).map((f) => f.length)).toEqual([8, 8]);
    expect(chunker.pendingBytes).toBe(0);
    expect(chunker.flush()).toBeNull();
  });

  it("pads the flushed tail to whole samples", () => {
    const chunker = new FrameChunker(8);
    chunker.push(Buffer.from([1, 2, 3]));
    const tail = chunker.flush();
    expect(tail?.length).toBe(4);
  });
});

describe("levels and wav", () => {
  it("measures RMS", () => {
    expect(rmsLevel(Buffer.alloc(320))).toBe(0);
    const loud = Buffer.alloc(320);
    for (let i = 0; i < 160; i++) loud.writeInt16LE(i % 2 ? 32767 : -32768, i * 2);
    expect(rmsLevel(loud)).toBeGreaterThan(0.99);
  });

  it("round-trips through a WAV container", () => {
    const pcm = sine(400, 16_000, 500);
    const parsed = fromWav(toWav(pcm, 16_000));
    expect(parsed.sampleRate).toBe(16_000);
    expect(parsed.channels).toBe(1);
    expect(parsed.pcm.equals(pcm)).toBe(true);
  });

  it("computes frame sizes", () => {
    expect(bytesForMs(32, 16_000)).toBe(1024);
    expect(bytesForMs(20, 24_000)).toBe(960);
  });
});

import { PacedSpeaker } from "../src/audio/pcm";
import { afterEach, beforeEach, vi } from "vitest";

describe("PacedSpeaker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("releases at ~real time instead of dumping, then fires finish once drained", () => {
    const sent: number[] = [];
    // 16 kHz mono PCM16 = 32000 B/s. 1 s of audio = 32000 B in 1024-B frames.
    const pacer = new PacedSpeaker((f) => sent.push(f.length), { bytesPerSecond: 32000, leadMs: 250, tickMs: 20 });
    for (let i = 0; i < 32; i++) pacer.push(Buffer.alloc(1024)); // ~32 KB burst

    const immediate = sent.reduce((a, b) => a + b, 0);
    expect(immediate).toBeLessThanOrEqual(250 / 1000 * 32000 + 1024); // only ~lead worth up front
    expect(immediate).toBeGreaterThan(0);

    let finished = false;
    pacer.finish(() => (finished = true));
    expect(finished).toBe(false); // still draining

    vi.advanceTimersByTime(1200); // past the 1 s of audio
    const total = sent.reduce((a, b) => a + b, 0);
    expect(total).toBe(32 * 1024);
    expect(finished).toBe(true);
  });

  it("finish() with no audio calls back immediately", () => {
    const pacer = new PacedSpeaker(() => {}, { bytesPerSecond: 32000, leadMs: 250 });
    let done = false;
    pacer.finish(() => (done = true));
    expect(done).toBe(true);
  });

  it("holds audio until firmware is ready, then starts pacing without a catch-up burst", () => {
    let ready = false;
    const sent: number[] = [];
    const done = vi.fn();
    const pacer = new PacedSpeaker(f => sent.push(f.length), {
      bytesPerSecond: 32000, leadMs: 100, isReady: () => ready,
    });
    for (let i = 0; i < 64; i++) pacer.push(Buffer.alloc(1024));
    pacer.finish(done);
    vi.advanceTimersByTime(2000);
    expect(sent).toHaveLength(0);
    ready = true;
    vi.advanceTimersByTime(20);
    expect(sent.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(4224);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2200);
    expect(sent.reduce((a, b) => a + b, 0)).toBe(65536);
    expect(done).toHaveBeenCalledOnce();
  });

  it("stop() drops the queue and never calls finish", () => {
    const sent: number[] = [];
    const pacer = new PacedSpeaker((f) => sent.push(f.length), { bytesPerSecond: 32000, leadMs: 100, tickMs: 20 });
    for (let i = 0; i < 32; i++) pacer.push(Buffer.alloc(1024));
    let done = false;
    pacer.finish(() => (done = true));
    pacer.stop();
    vi.advanceTimersByTime(2000);
    expect(done).toBe(false);
    pacer.push(Buffer.alloc(1024)); // ignored after stop
    expect(sent.reduce((a, b) => a + b, 0)).toBeLessThan(32 * 1024);
  });

  it("does not accumulate burst credit during an upstream audio pause", () => {
    let sent = 0;
    const pacer = new PacedSpeaker(f => { sent += f.length; }, { bytesPerSecond: 32000, leadMs: 100 });
    pacer.push(Buffer.alloc(1024));
    vi.advanceTimersByTime(2000);
    const before = sent;
    for (let i = 0; i < 64; i++) pacer.push(Buffer.alloc(1024));
    expect(sent - before).toBeLessThanOrEqual(4224);
    const done = vi.fn();
    pacer.finish(done);
    vi.advanceTimersByTime(2200);
    expect(sent).toBe(65 * 1024);
    expect(done).toHaveBeenCalledOnce();
  });
});
