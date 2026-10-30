import { afterEach, describe, expect, test } from "vitest";

import { slotIsOn } from "./slot-day";

const slot = { date: "2026-11-07T00:00:00.000Z", startTime: "15:00", endTime: "15:45" };

describe(slotIsOn, () => {
  const utc = process.env.TZ;
  afterEach(() => {
    process.env.TZ = utc;
  });

  test("a slot is on during its time on its day, read on a screen west of UTC", () => {
    process.env.TZ = "America/Montevideo";

    // Montevideo is UTC-3: 15:00 there is 18:00 UTC.
    expect(
      ["2026-11-07T17:59:00Z", "2026-11-07T18:00:00Z", "2026-11-07T18:44:00Z", "2026-11-07T18:45:00Z"].map((at) =>
        slotIsOn(slot, new Date(at))
      )
    ).toStrictEqual([false, true, true, false]);
  });

  test("the same time on another day is not the slot", () => {
    process.env.TZ = "America/Montevideo";

    expect(slotIsOn(slot, new Date("2026-11-08T18:20:00Z"))).toBe(false);
  });
});
