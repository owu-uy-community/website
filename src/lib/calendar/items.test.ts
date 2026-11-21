import { describe, expect, test } from "vitest";

import { dayKey } from "lib/community/time";

import { itemDays, mergeItems, monthRange, shiftMonth } from "./items";
import type { CalendarItem } from "./score";

const item = (overrides: Partial<CalendarItem>): CalendarItem => ({
  id: "x",
  communitySlug: "python-montevideo",
  communityName: "Python Montevideo",
  title: "Meetup",
  start: "2026-11-12T19:00:00-03:00",
  end: null,
  topics: [],
  kind: "event",
  isOwu: false,
  ...overrides,
});

describe(monthRange, () => {
  test("knows each month's length, February included", () => {
    expect([monthRange("2026-11"), monthRange("2028-02")]).toStrictEqual([
      { from: "2026-11-01", to: "2026-11-30" },
      { from: "2028-02-01", to: "2028-02-29" },
    ]);
    expect([shiftMonth("2026-12", 1), shiftMonth("2026-01", -1)]).toStrictEqual(["2027-01", "2025-12"]);
  });
});

describe(mergeItems, () => {
  test("drops the feed's copy of a meetup the community already has in OWU, and nothing else", () => {
    const ours = item({ id: "db" });
    const copy = item({ id: "meetup-1", start: "2026-11-12T19:30:00-03:00" });
    const otherGroup = item({ id: "meetup-2", communitySlug: "montevideo-js" });
    const unknownGroup = item({ id: "meetup-3", communitySlug: null });
    const laterThatWeek = item({ id: "meetup-4", start: "2026-11-14T19:00:00-03:00" });
    const hold = item({ id: "hold", kind: "hold", start: "2026-11-14T19:00:00-03:00" });

    expect(
      mergeItems([ours, hold], [copy, otherGroup, unknownGroup, laterThatWeek]).map((entry) => entry.id)
    ).toStrictEqual(["db", "meetup-2", "meetup-3", "hold", "meetup-4"]);
  });
});

describe(itemDays, () => {
  test("a two-day event sits on both days", () => {
    expect(itemDays("2026-11-07T10:00:00-03:00", "2026-11-08T18:00:00-03:00", dayKey)).toStrictEqual([
      "2026-11-07",
      "2026-11-08",
    ]);
  });
});
