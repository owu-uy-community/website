import { describe, expect, test } from "vitest";

import { HOLD_MS, SETTLED_MS, SLIP_EVERY_MS, cueAt } from "./unplugged";

const noisyBetween = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => cueAt(from + i)).some((cue) => cue.noise);

describe("OWU Unplugged cut", () => {
  test("holds OWU's look, glitches about as long as the video, then settles on pixels", () => {
    expect(noisyBetween(0, HOLD_MS)).toBe(false);
    expect(cueAt(0)).toStrictEqual({ look: "owu", noise: false });
    expect(cueAt(HOLD_MS)).toStrictEqual({ look: "pixel", noise: true });
    // The video glitches for 1.57 s
    expect(SETTLED_MS - HOLD_MS).toBeCloseTo(1570, -2);
    expect(cueAt(SETTLED_MS)).toStrictEqual({ look: "pixel", noise: false });
  });

  test("slips back to OWU once per window, at its end", () => {
    expect(noisyBetween(SETTLED_MS, SETTLED_MS + SLIP_EVERY_MS - 400)).toBe(false);
    expect(cueAt(SETTLED_MS + SLIP_EVERY_MS - 1)).toStrictEqual({ look: "owu", noise: true });
    expect(cueAt(SETTLED_MS + SLIP_EVERY_MS)).toStrictEqual({ look: "pixel", noise: false });
    expect(cueAt(SETTLED_MS + 3 * SLIP_EVERY_MS - 1).noise).toBe(true);
  });
});
