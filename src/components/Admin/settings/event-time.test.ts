import { describe, expect, test } from "vitest";

import { fromWallClock, timeZoneOptions, toWallClock, utcOffset } from "./event-time";

describe("event wall clock", () => {
  test("Montevideo 14:30 is 17:30 UTC, and back", () => {
    const at = fromWallClock("2026-11-07", "14:30", "America/Montevideo");

    expect(at.toISOString()).toBe("2026-11-07T17:30:00.000Z");
    expect(toWallClock(at, "America/Montevideo")).toStrictEqual({ day: "2026-11-07", time: "14:30" });
  });

  test("a late end lands on the next UTC day but stays on the event's day", () => {
    const at = fromWallClock("2026-11-07", "21:30", "America/Montevideo");

    expect(at.toISOString()).toBe("2026-11-08T00:30:00.000Z");
    expect(toWallClock(at.toISOString(), "America/Montevideo").day).toBe("2026-11-07");
  });

  test("zones with DST and half-hour offsets", () => {
    // Madrid is on summer time (UTC+2) in June and winter time (UTC+1) in November.
    expect(fromWallClock("2026-06-20", "10:00", "Europe/Madrid").toISOString()).toBe("2026-06-20T08:00:00.000Z");
    expect(fromWallClock("2026-11-20", "10:00", "Europe/Madrid").toISOString()).toBe("2026-11-20T09:00:00.000Z");
    expect(fromWallClock("2026-11-07", "09:00", "Asia/Kolkata").toISOString()).toBe("2026-11-07T03:30:00.000Z");
  });

  test("offsets read the way the settings show them", () => {
    const november = new Date("2026-11-07T17:30:00Z");

    expect(utcOffset("America/Montevideo", november)).toBe("UTC−3");
    expect(utcOffset("Asia/Kolkata", november)).toBe("UTC+5:30");
    expect(utcOffset("UTC", november)).toBe("UTC");
  });

  test("Montevideo comes first, and a stored alias is kept", () => {
    expect(timeZoneOptions()[0]).toBe("America/Montevideo");
    expect(timeZoneOptions().filter((zone) => zone === "America/Montevideo")).toHaveLength(1);
    // Engines list the older names (America/Buenos_Aires); a stored newer one must not vanish.
    expect(timeZoneOptions("America/Argentina/Buenos_Aires").slice(0, 2)).toStrictEqual([
      "America/Montevideo",
      "America/Argentina/Buenos_Aires",
    ]);
  });
});
