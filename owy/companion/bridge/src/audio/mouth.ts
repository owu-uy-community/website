/**
 * Lip shapes for turns this device does NOT play itself (audio output routed
 * to the laptop): the device's own speaker tap is silent then, so the bridge
 * computes the same features the firmware does (companion_model.h
 * `SpeechAnalyzer`) and sends them with the `mouth_track` action.
 *
 * One base64url char per 40 ms frame = open (0..15) << 2 | shape (0 wide .. 3 round).
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const MOUTH_FRAME_MS = 40;
const BLOCK = 160; // 10 ms at 16 kHz, like the firmware
const BLOCKS_PER_FRAME = MOUTH_FRAME_MS / 10;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function encodeMouth(open: number, shape: number): string {
  const o = Math.round(clamp(open, 0, 1) * 15);
  const s = Math.round((clamp(shape, -1, 1) + 1) * 1.5);
  return ALPHABET[(o << 2) | s]!;
}

export function decodeMouth(char: string): { open: number; shape: number } | null {
  const v = ALPHABET.indexOf(char);
  return v < 0 ? null : { open: (v >> 2) / 15, shape: (v & 3) / 1.5 - 1 };
}

/** 16 kHz mono PCM16LE in, mouth chars out (one per completed 40 ms frame). */
export class MouthEncoder {
  private energy = 0;
  private diff = 0;
  private diff2 = 0;
  private x1 = 0;
  private x2 = 0;
  private n = 0;
  private peak = 0;
  private mean1 = 0.04;
  private mean2 = 0.6;
  private open = 0;
  private shapeSum = 0;
  private blocks = 0;

  push(pcm: Buffer): string {
    let out = "";
    for (let p = 0; p + 1 < pcm.length; p += 2) {
      const s = pcm.readInt16LE(p);
      const d = s - this.x1;
      const d2 = s - 2 * this.x1 + this.x2;
      this.energy += s * s;
      this.diff += d * d;
      this.diff2 += d2 * d2;
      this.x2 = this.x1;
      this.x1 = s;
      if (++this.n === BLOCK) out += this.block();
    }
    return out;
  }

  private block(): string {
    const rms = Math.sqrt(this.energy / BLOCK);
    this.peak = Math.max(rms, this.peak * 0.996);
    const floor = Math.max(180, this.peak * 0.1);
    const top = Math.max(this.peak * 0.75, floor + 400);
    const open = clamp((rms - floor) / (top - floor), 0, 1);
    let shape = 0;
    if (open > 0.15) {
      const r1 = this.diff / (this.energy + 1);
      const r2 = this.diff2 / (this.diff + 1);
      this.mean1 += (r1 - this.mean1) * 0.03;
      this.mean2 += (r2 - this.mean2) * 0.03;
      const wide = clamp((r2 / this.mean2 - 1.12) / 0.3, 0, 1);
      const round = Math.max(clamp((0.8 - r2 / this.mean2) / 0.3, 0, 1), clamp((0.6 - r1 / this.mean1) / 0.25, 0, 1));
      shape = round - wide;
    }
    this.energy = this.diff = this.diff2 = 0;
    this.n = 0;
    // A 40 ms frame keeps its loudest block and the loudness-weighted shape.
    this.open = Math.max(this.open, open);
    this.shapeSum += shape * open;
    if (++this.blocks < BLOCKS_PER_FRAME) return "";
    const total =
      this.open > 0
        ? encodeMouth(this.open, this.shapeSum / Math.max(1e-6, this.open * BLOCKS_PER_FRAME))
        : encodeMouth(0, 0);
    this.open = this.shapeSum = 0;
    this.blocks = 0;
    return total;
  }
}

/**
 * Batches mouth chars and stamps each batch with when its first frame becomes
 * audible: the frame left the pacer ~40 ms before its char completed, then
 * `latencyMs` of browser playback queue (tune by eye on hardware).
 */
export class MouthTrack {
  private encoder = new MouthEncoder();
  private chars = "";
  private firstAt = 0;

  constructor(
    private readonly send: (frames: string, leadMs: number) => void,
    private readonly latencyMs = 250,
    private readonly batch = 5,
    private readonly now: () => number = Date.now
  ) {}

  push(pcm: Buffer): void {
    for (const char of this.encoder.push(pcm)) {
      if (!this.chars) this.firstAt = this.now() - MOUTH_FRAME_MS;
      this.chars += char;
      if (this.chars.length >= this.batch) this.flush();
    }
  }

  flush(): void {
    if (!this.chars) return;
    this.send(this.chars, Math.round(this.firstAt + this.latencyMs - this.now()));
    this.chars = "";
  }
}
