import { describe, expect, test } from "vitest";

import { formatWhen, zonedInstant } from "./cadence";

describe(zonedInstant, () => {
  test.each([
    ["America/Montevideo", "2026-11-06", "10:00", "2026-11-06T13:00:00.000Z"],
    // Daylight saving on either side of the date: -4 in summer, -5 in winter.
    ["America/New_York", "2026-07-01", "09:00", "2026-07-01T13:00:00.000Z"],
    ["America/New_York", "2026-12-01", "09:00", "2026-12-01T14:00:00.000Z"],
    ["UTC", "2026-11-08", "10:00", "2026-11-08T10:00:00.000Z"],
  ])("%s %s %s is %s", (timeZone, day, time, instant) => {
    expect(zonedInstant(day, time, timeZone).toISOString()).toBe(instant);
  });
});

describe(formatWhen, () => {
  test("reads on the event's clock", () => {
    expect(formatWhen("2026-11-06T13:00:00.000Z", "America/Montevideo")).toBe("vie 6 nov · 10:00");
    expect(formatWhen("2026-11-06T13:00:00.000Z", "America/Montevideo", false)).toBe("vie 6 nov");
  });
});
