import { describe, expect, test } from "vitest";

import { digestDue, isoWeek } from "./digest";

describe(isoWeek, () => {
  test("weeks run Monday to Sunday in Montevideo; the Thursday decides the year", () => {
    expect(isoWeek(new Date("2026-10-19T12:00:00Z"))).toBe("2026-W43"); // Monday
    expect(isoWeek(new Date("2026-10-26T02:30:00Z"))).toBe("2026-W43"); // Sunday 23:30 in Montevideo
    expect(isoWeek(new Date("2026-10-26T03:30:00Z"))).toBe("2026-W44"); // Monday 00:30
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(new Date("2025-12-29T12:00:00Z"))).toBe("2026-W01");
  });
});

describe(digestDue, () => {
  test("Monday from 09:00 in Montevideo", () => {
    expect(digestDue(new Date("2026-10-26T11:59:00Z"))).toBe(false); // 08:59
    expect(digestDue(new Date("2026-10-26T12:00:00Z"))).toBe(true); // 09:00
    expect(digestDue(new Date("2026-10-27T02:00:00Z"))).toBe(true); // Monday 23:00
    expect(digestDue(new Date("2026-10-27T12:00:00Z"))).toBe(false); // Tuesday
  });
});
