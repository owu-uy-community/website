import { describe, expect, test } from "vitest";

import { ranOut } from "./useCountdownAudio";

const at = "2026-11-07T18:00:00.000Z";
const running = { isRunning: true, remainingSeconds: 1, lastUpdated: at };
const zero = { isRunning: false, remainingSeconds: 0, lastUpdated: at };

describe(ranOut, () => {
  test("a running countdown that reaches zero on its own ran out", () => {
    expect(ranOut(running, zero)).toBe(true);
  });

  test("a reset, a screen opened on zero, or a pause did not", () => {
    expect(ranOut({ ...running, remainingSeconds: 300 }, { ...zero, lastUpdated: "2026-11-07T18:01:00.000Z" })).toBe(
      false
    );
    expect(ranOut(zero, zero)).toBe(false);
    expect(ranOut(running, { ...running, isRunning: false })).toBe(false);
  });
});
