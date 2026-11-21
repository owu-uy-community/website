import { describe, expect, test } from "vitest";

import { occurrenceIn, occurrenceName, occurrences, slotLabel } from "./recurring";

const THURSDAY = 4;
const TUESDAY = 2;

describe(occurrenceIn, () => {
  test.each([
    // The 2nd Thursday across months that start on different weekdays
    ["2026-10", 2, THURSDAY, "2026-10-08"],
    ["2026-11", 2, THURSDAY, "2026-11-12"],
    ["2026-12", 2, THURSDAY, "2026-12-10"],
    ["2027-01", 2, THURSDAY, "2027-01-14"],
    // A month that starts on the weekday itself
    ["2027-04", 1, THURSDAY, "2027-04-01"],
    ["2027-04", 4, THURSDAY, "2027-04-22"],
    // The last one: 4th or 5th week
    ["2026-10", -1, THURSDAY, "2026-10-29"],
    ["2026-12", -1, THURSDAY, "2026-12-31"],
    ["2026-09", -1, TUESDAY, "2026-09-29"],
    // February in a leap year, on the 29th
    ["2028-02", -1, TUESDAY, "2028-02-29"],
  ])("%s, nth %i of weekday %i → %s", (month, nth, weekday, day) => {
    expect(occurrenceIn({ weekday, nth }, month)).toBe(day);
  });

  test("a 5th week is never the 4th: the 4th Thursday of a five-Thursday month is not its last", () => {
    // October 2026 has five Thursdays: 1, 8, 15, 22, 29
    expect(occurrenceIn({ weekday: THURSDAY, nth: 4 }, "2026-10")).toBe("2026-10-22");
    expect(occurrenceIn({ weekday: THURSDAY, nth: -1 }, "2026-10")).toBe("2026-10-29");
  });

  test("anything but 1–4 or last has no day", () => {
    expect(occurrenceIn({ weekday: THURSDAY, nth: 5 }, "2026-10")).toBeNull();
    expect(occurrenceIn({ weekday: THURSDAY, nth: 0 }, "2026-10")).toBeNull();
  });
});

describe(occurrences, () => {
  test("every occurrence inside the range, across a year change, ends included", () => {
    expect(occurrences({ weekday: THURSDAY, nth: 2 }, "2026-11-12", "2027-02-11")).toStrictEqual([
      "2026-11-12",
      "2026-12-10",
      "2027-01-14",
      "2027-02-11",
    ]);
  });

  test("leaves out the month's occurrence before `from`", () => {
    expect(occurrences({ weekday: THURSDAY, nth: 2 }, "2026-11-13", "2026-12-31")).toStrictEqual(["2026-12-10"]);
  });
});

describe(slotLabel, () => {
  test("slots and occurrences read in Spanish", () => {
    expect(slotLabel({ weekday: THURSDAY, nth: 2, time: "19:00", durationMin: 120 })).toBe("2.º jueves · 19:00");
    expect(slotLabel({ weekday: TUESDAY, nth: -1, time: "18:30", durationMin: 90 })).toBe("último martes · 18:30");
    expect(occurrenceName("2026-11-12")).toBe("jueves 12/11");
  });
});
