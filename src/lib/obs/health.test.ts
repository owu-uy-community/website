import { describe, expect, test } from "vitest";

import { congestionTone, streamKbps, type StreamStatus } from "./health";

const live = (outputBytes: number): StreamStatus => ({
  outputActive: true,
  outputBytes,
  outputCongestion: 0,
  outputReconnecting: false,
});

describe(streamKbps, () => {
  test("the bytes sent between two polls give the bitrate", () => {
    // 3 875 000 bytes in 5 s = 31 Mbit / 5 s = 6.2 Mb/s.
    expect(streamKbps(live(4_875_000), { bytes: 1_000_000, at: 10_000 }, 15_000)).toBe(6200);
  });

  test("no bitrate before a second sample, after a restart, or while off air", () => {
    expect(streamKbps(live(5_000), null, 15_000)).toBeNull();
    expect(streamKbps(live(5_000), { bytes: 9_000_000, at: 10_000 }, 15_000)).toBeNull();
    expect(streamKbps({ ...live(9_000), outputActive: false }, { bytes: 1_000, at: 10_000 }, 15_000)).toBeNull();
  });
});

describe(congestionTone, () => {
  test("OBS's thresholds: above 0.8 is bad, above 0.5 a warning", () => {
    expect([0, 0.5, 0.51, 0.8, 0.81].map(congestionTone)).toStrictEqual(["ok", "ok", "warn", "warn", "live"]);
  });
});
