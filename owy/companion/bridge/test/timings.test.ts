import { describe, expect, it } from "vitest";
import { EnvSchema } from "../src/config";
import { PITCH_LIMITS } from "../src/pitch";
import { TIMINGS } from "../src/timings";

/** The bridge owns every budget now (the knob runs no pipeline): they only have to fit each other. */
describe("turn budgets", () => {
  it("gives a pitch room to be understood and placed: extract, a duplicate check, a slow board write", () => {
    // Extract (20 s) + a duplicate check (4 s) + a slow board write (20 s) at the very least.
    expect(TIMINGS.pitchThinkingMs).toBeGreaterThanOrEqual(45_000);
    expect(TIMINGS.pitchThinkingMs).toBeGreaterThan(TIMINGS.placeTimeoutMs * 2);
  });

  it("lets the longest pitch the env allows be recorded before the recorder's own cap", () => {
    const longest = EnvSchema.shape.COMPANION_PITCH_MAX_S.unwrap().maxValue ?? 0;
    expect(longest * 1000).toBeGreaterThanOrEqual(PITCH_LIMITS.pitch.maxMs);
  });

  it("answers a question before the flow stops waiting for one", () => {
    expect(TIMINGS.answerGapMs).toBeLessThan(1_000);
  });
});
