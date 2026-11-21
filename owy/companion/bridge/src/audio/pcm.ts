import { systemClock, type RuntimeClock } from "../clock";
/**
 * PCM16 helpers for the two audio rates in play:
 *   - ESPHome voice_assistant: 16 kHz, 16-bit, mono, little-endian (both directions).
 *   - Gemini Live output: 24 kHz, 16-bit, mono, little-endian.
 *
 * Everything works on Buffers of little-endian int16 samples so no Float32
 * round-trips are needed (the AI SDK's `experimental_resampleAudio` is
 * Float32-only and browser-oriented).
 */

export const DEVICE_SAMPLE_RATE = 16_000;
export const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;
export const BYTES_PER_SAMPLE = 2;

/** Bytes for `ms` milliseconds of mono PCM16 at `rate`. */
export function bytesForMs(ms: number, rate: number): number {
  return Math.round((rate * ms) / 1000) * BYTES_PER_SAMPLE;
}

/**
 * Second-order Butterworth low-pass (transposed direct form II), stateful so it
 * filters continuously across chunk boundaries. Used as the anti-aliasing
 * filter before downsampling, and as a mild de-esser on the way in.
 */
export class BiquadLowpass {
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private readonly a1: number;
  private readonly a2: number;
  private z1 = 0;
  private z2 = 0;

  constructor(cutoffHz: number, sampleRate: number) {
    const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / Math.SQRT2; // Q = 1/sqrt(2), Butterworth
    const b0 = (1 - cos) / 2;
    const b1 = 1 - cos;
    const b2 = (1 - cos) / 2;
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }
}

/**
 * Stateful linear-interpolation resampler for mono PCM16. Keeps the fractional
 * read position and the last input sample across calls, so chunk boundaries do
 * not click. Linear interpolation is plenty for speech going 24k → 16k; the
 * averaging of the two neighbouring samples doubles as a mild low-pass.
 */
export class Pcm16Resampler {
  private position = 0; // fractional index into the *virtual* continuous input stream, relative to `carry`
  private carry: number | null = null; // last filtered input sample of the previous chunk
  private readonly step: number;
  // Anti-aliasing low-pass at ~0.45 of the output Nyquist, only when downsampling.
  // Without it, input content above the output Nyquist folds back as harsh noise.
  private readonly lpf: BiquadLowpass | null;

  constructor(
    readonly inputRate: number,
    readonly outputRate: number
  ) {
    if (inputRate <= 0 || outputRate <= 0) throw new Error("sample rates must be positive");
    this.step = inputRate / outputRate;
    this.lpf = outputRate < inputRate ? new BiquadLowpass(outputRate * 0.45, inputRate) : null;
  }

  /** Resamples a chunk; returns the output samples produced so far for this input. */
  process(input: Buffer): Buffer {
    const inSamples = Math.floor(input.length / BYTES_PER_SAMPLE);
    if (inSamples === 0) return Buffer.alloc(0);

    // Anti-alias filter first (stateful across chunks), then interpolate.
    const filtered = new Array<number>(inSamples);
    for (let i = 0; i < inSamples; i++) {
      const raw = input.readInt16LE(i * BYTES_PER_SAMPLE);
      filtered[i] = this.lpf ? this.lpf.process(raw) : raw;
    }

    if (this.inputRate === this.outputRate) {
      const buffer = Buffer.alloc(inSamples * BYTES_PER_SAMPLE);
      for (let i = 0; i < inSamples; i++) buffer.writeInt16LE(clamp16(Math.round(filtered[i])), i * BYTES_PER_SAMPLE);
      return buffer;
    }

    // Virtual input = [carry, ...filtered].
    const hasCarry = this.carry !== null;
    const total = inSamples + (hasCarry ? 1 : 0);
    const sampleAt = (i: number): number =>
      hasCarry ? (i === 0 ? (this.carry as number) : filtered[i - 1]) : filtered[i];

    const out: number[] = [];
    let pos = this.position;
    while (pos + 1 < total) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = sampleAt(i);
      const b = sampleAt(i + 1);
      out.push(a + (b - a) * frac);
      pos += this.step;
    }

    this.carry = sampleAt(total - 1);
    this.position = pos - (total - 1);

    const buffer = Buffer.alloc(out.length * BYTES_PER_SAMPLE);
    for (let i = 0; i < out.length; i++) buffer.writeInt16LE(clamp16(Math.round(out[i])), i * BYTES_PER_SAMPLE);
    return buffer;
  }

  reset(): void {
    this.position = 0;
    this.carry = null;
    this.lpf?.reset();
  }
}

function clamp16(value: number): number {
  return value > 32767 ? 32767 : value < -32768 ? -32768 : value;
}

/**
 * Re-chunks an arbitrary byte stream into fixed-size frames, carrying the
 * remainder to the next call. `flush()` returns whatever is left (padded with
 * silence so the device always gets whole samples).
 */
export class FrameChunker {
  private pending: Buffer = Buffer.alloc(0);

  constructor(readonly frameBytes: number) {
    if (frameBytes <= 0 || frameBytes % BYTES_PER_SAMPLE !== 0) {
      throw new Error("frameBytes must be a positive multiple of 2");
    }
  }

  push(chunk: Buffer): Buffer[] {
    this.pending = this.pending.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.pending, chunk]);
    const frames: Buffer[] = [];
    let offset = 0;
    while (this.pending.length - offset >= this.frameBytes) {
      frames.push(this.pending.subarray(offset, offset + this.frameBytes));
      offset += this.frameBytes;
    }
    this.pending = this.pending.subarray(offset);
    return frames;
  }

  flush(): Buffer | null {
    if (this.pending.length === 0) return null;
    const padded = Buffer.alloc(this.pending.length + (this.pending.length % BYTES_PER_SAMPLE));
    this.pending.copy(padded);
    this.pending = Buffer.alloc(0);
    return padded;
  }

  get pendingBytes(): number {
    return this.pending.length;
  }
}

/** Root-mean-square level of a PCM16 buffer, normalised to 0..1. */
export function rmsLevel(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / BYTES_PER_SAMPLE);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const s = pcm.readInt16LE(i * BYTES_PER_SAMPLE) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

/** Minimal 44-byte RIFF/WAVE header for mono PCM16 (debug captures). */
export function wavHeader(dataLength: number, sampleRate: number, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * BYTES_PER_SAMPLE;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

export function toWav(pcm: Buffer, sampleRate: number): Buffer {
  return Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]);
}

/** Splits a WAV file into its PCM payload and sample rate (mono/stereo PCM16 only). */
export function fromWav(wav: Buffer): { pcm: Buffer; sampleRate: number; channels: number } {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 1;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = wav.readUInt16LE(offset + 10);
      sampleRate = wav.readUInt32LE(offset + 12);
      const bits = wav.readUInt16LE(offset + 22);
      if (bits !== 16) throw new Error(`unsupported WAV bit depth ${bits}`);
    } else if (id === "data") {
      const end = size === 0 || size === 0xffffffff ? wav.length : Math.min(wav.length, offset + 8 + size);
      return { pcm: wav.subarray(offset + 8, end), sampleRate, channels };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV data chunk not found");
}

/**
 * Paces PCM frames out to the device speaker at ~real time.
 *
 * Gemini delivers a whole reply in a burst, but the ESPHome `voice_assistant`
 * speaker plays at real time with a small buffer ("Cannot receive audio,
 * buffer is full" when overrun). This releases frames so the device stays at
 * most `leadMs` ahead of playback, the way Home Assistant's assist pipeline
 * does. Call `finish(cb)` when the model is done; `cb` fires once every frame
 * has been paced out, which is when TTS_STREAM_END should be sent.
 */
export class PacedSpeaker {
  private readonly clock: RuntimeClock;
  private queue: Buffer[] = [];
  private sentBytes = 0;
  private startTime: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ended = false;
  private onDrained: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly send: (frame: Buffer) => void,
    private readonly opts: { bytesPerSecond: number; leadMs: number; tickMs?: number; isReady?: () => boolean; clock?: RuntimeClock }
  ) { this.clock = opts.clock ?? systemClock; }

  push(frame: Buffer): void {
    if (this.stopped || frame.length === 0) return;
    this.queue.push(frame);
    if (this.timer === null) {
      this.timer = this.clock.setInterval(() => this.drain(), this.opts.tickMs ?? 20);
    }
    this.drain();
  }

  /** No more audio will be pushed; `done` fires once the queue has drained at pace. */
  finish(done: () => void): void {
    if (this.stopped) return;
    this.ended = true;
    this.onDrained = done;
    if (this.timer === null) {
      // No audio ever arrived: nothing to pace.
      done();
      this.onDrained = null;
      return;
    }
    this.drain();
  }

  /** Aborts playback (tap interrupt, disconnect): drops the queue, no callback. */
  stop(): void {
    this.stopped = true;
    if (this.timer) this.clock.clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
    this.onDrained = null;
  }

  private drain(): void {
    if (this.stopped) return;
    if (this.opts.isReady && !this.opts.isReady()) return;
    this.startTime ??= this.clock.now();
    const elapsed = this.clock.now() - this.startTime;
    let allowed = Math.floor((this.opts.bytesPerSecond * (elapsed + this.opts.leadMs)) / 1000);
    const leadBytes = this.opts.bytesPerSecond * this.opts.leadMs / 1000;
    // A network/model pause (or a delayed event loop) is not credit to dump
    // seconds of audio on resumption. Rebase the playback clock instead.
    if (allowed - this.sentBytes > leadBytes) {
      this.startTime = this.clock.now() - this.sentBytes * 1000 / this.opts.bytesPerSecond;
      allowed = this.sentBytes + leadBytes;
    }
    while (this.queue.length > 0 && this.sentBytes < allowed) {
      const frame = this.queue.shift() as Buffer;
      this.send(frame);
      this.sentBytes += frame.length;
    }
    if (this.ended && this.queue.length === 0) {
      if (this.timer) this.clock.clearInterval(this.timer);
      this.timer = null;
      const cb = this.onDrained;
      this.onDrained = null;
      cb?.();
    }
  }
}
