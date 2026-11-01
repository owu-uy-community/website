import { describe, expect, test } from "vitest";

import { pickChannel } from "../../../public/companion-audio/pcm.mjs";

describe("capture channel pick", () => {
  const left = Float32Array.from([0.2, 0.4]);
  const right = Float32Array.from([0.6, 0]);
  const scratch = new Float32Array(2);

  test("L, R and mix on a stereo input (DJI: TX1 left, TX2 right)", () => {
    expect(pickChannel([left, right], "L", scratch)).toBe(left);
    expect(pickChannel([left, right], "R", scratch)).toBe(right);
    expect([...pickChannel([left, right], "mix", scratch)].map((v) => v.toFixed(2))).toStrictEqual(["0.40", "0.20"]);
  });

  test("a mono mic is always its only side", () => {
    expect(pickChannel([left], "R", scratch)).toBe(left);
    expect(pickChannel([left], "mix", scratch)).toBe(left);
  });
});
