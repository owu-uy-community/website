import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EnvSchema } from "../src/config";
import { FIRMWARE_WATCHDOG_MS, pitchThinkingMs, REPLY_MARGIN_MS, TIMINGS } from "../src/timings";

const voiceYaml = readFileSync(path.resolve(import.meta.dirname, "../../firmware/packages/voice.yaml"), "utf8");

describe("turn budgets fit the board's watchdog", () => {
  it("knows the watchdog the firmware runs", () => {
    const match = /return id\(pitch_active\) \? (\d+) : (\d+);/.exec(voiceYaml);
    expect(match, "turn_watchdog delay in voice.yaml").not.toBeNull();
    expect({ pitch: Number(match![1]), turn: Number(match![2]) }).toEqual(FIRMWARE_WATCHDOG_MS);
  });

  it("leaves a conversation turn room to listen, think on the cascade and answer", () => {
    expect(TIMINGS.turn.maxMs + TIMINGS.cascadeThinkingMs + REPLY_MARGIN_MS).toBeLessThanOrEqual(FIRMWARE_WATCHDOG_MS.turn);
  });

  it("gives the longest pitch the env allows time to be understood and placed", () => {
    const longest = EnvSchema.shape.COMPANION_PITCH_MAX_S.unwrap().maxValue ?? 0;
    const defaults = EnvSchema.parse({});
    // Extract (20 s) + a duplicate check (4 s) + a slow board write (20 s) at the very least.
    expect(pitchThinkingMs(longest)).toBeGreaterThanOrEqual(45_000);
    expect(pitchThinkingMs(defaults.COMPANION_PITCH_MAX_S)).toBeGreaterThanOrEqual(60_000);
    for (const seconds of [20, defaults.COMPANION_PITCH_MAX_S, longest])
      expect(seconds * 1000 + pitchThinkingMs(seconds) + REPLY_MARGIN_MS).toBeLessThanOrEqual(FIRMWARE_WATCHDOG_MS.pitch);
  });
});
