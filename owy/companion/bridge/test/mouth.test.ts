import { describe, expect, it } from "vitest";

import { decodeMouth, encodeMouth, MouthEncoder, MouthTrack } from "../src/audio/mouth";

/** 16 kHz PCM16LE tone. */
function tone(hz: number, ms: number, amplitude = 8000): Buffer {
  const n = (16_000 * ms) / 1000;
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    out.writeInt16LE(Math.round(amplitude * Math.sin((2 * Math.PI * hz * i) / 16_000)), i * 2);
  return out;
}

describe("mouth track encoding", () => {
  it("round-trips open/shape through one base64url char", () => {
    for (const [open, shape] of [
      [0, 0],
      [1, -1],
      [1, 1],
      [0.4, 0.33],
    ] as const) {
      const back = decodeMouth(encodeMouth(open, shape))!;
      expect(Math.abs(back.open - open)).toBeLessThan(0.04);
      expect(Math.abs(back.shape - shape)).toBeLessThan(0.34);
    }
    expect(decodeMouth("*")).toBeNull();
  });

  it("closes on silence, opens on speech, and tells dark from bright sounds", () => {
    const encoder = new MouthEncoder();
    const silence = encoder.push(Buffer.alloc(1280 * 2)); // 80 ms
    expect([...silence].map((c) => decodeMouth(c)!.open)).toEqual([0, 0]); // closed
    // Alternate a dark (200 Hz) and a bright (3 kHz) sound so the running means settle between them.
    let dark = "",
      bright = "";
    for (let i = 0; i < 12; i++) {
      dark = encoder.push(tone(200, 200));
      bright = encoder.push(tone(3000, 200));
    }
    const last = (chars: string) => decodeMouth(chars.at(-1)!)!;
    expect(last(dark).open).toBeGreaterThan(0.5);
    expect(last(dark).shape).toBeGreaterThan(0); // round (o/u)
    expect(last(bright).shape).toBeLessThan(0); // wide (e/i)
    expect(dark.length).toBe(5); // one char per 40 ms
  });

  it("batches frames and stamps when the first one becomes audible", () => {
    let now = 10_000;
    const sent: [string, number][] = [];
    const track = new MouthTrack(
      (frames, lead) => sent.push([frames, lead]),
      250,
      5,
      () => now
    );
    for (let i = 0; i < 6; i++) {
      now += 40;
      track.push(tone(300, 40));
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]![0]).toHaveLength(5);
    // First frame left the pacer at ~10 000 ms; heard 250 ms later; flushed at 10 200.
    expect(sent[0]![1]).toBe(10_000 + 250 - 10_200);
    track.flush();
    expect(sent).toHaveLength(2);
    expect(sent[1]![0]).toHaveLength(1);
  });
});
