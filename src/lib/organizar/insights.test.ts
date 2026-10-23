import { describe, expect, test } from "vitest";

import { lastQuarters, npsOf, quarterOf, speakerStats, visitStats } from "./insights";

const NOW = Date.parse("2026-10-23T15:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY);

describe(visitStats, () => {
  // Four meetups a month apart; the door was used at all but the second
  const events = [
    { id: "jul", start: ago(100), doorUsed: true },
    { id: "ago", start: ago(70), doorUsed: false },
    { id: "sep", start: ago(40), doorUsed: true },
    { id: "oct", start: ago(10), doorUsed: true },
  ];
  const seat = (eventId: string, person: string, checkedIn = true) => ({ eventId, person, checkedIn });

  test("first-timers per event, counting only who came when the door was used", () => {
    const { perEvent } = visitStats(
      events,
      [
        seat("jul", "ana"),
        seat("jul", "beto", false), // signed up, didn't come
        seat("ago", "beto", false), // no door: a kept seat counts
        seat("sep", "ana"),
        seat("sep", "beto"),
        seat("sep", "caro"),
        seat("oct", "dani"),
      ],
      NOW
    );

    expect(Object.fromEntries(perEvent)).toStrictEqual({
      jul: { came: 1, firstTimers: 1 },
      ago: { came: 1, firstTimers: 1 },
      sep: { came: 3, firstTimers: 1 },
      oct: { came: 1, firstTimers: 1 },
    });
  });

  test("second visits: first-timers in 6 months who came again, leaving out the last event's", () => {
    const stats = visitStats(
      events,
      [
        seat("jul", "ana"),
        seat("sep", "ana"), // came back
        seat("ago", "beto", false), // first time in August, never again
        seat("sep", "caro"),
        seat("oct", "caro"), // came back
        seat("oct", "dani"), // first time at the last one: no chance yet
      ],
      NOW
    );

    expect(stats.secondVisit).toStrictEqual({ firstTimers: 3, returned: 2 });
    expect(stats.returning).toStrictEqual({ people: 4, before: 2 });
  });

  test("an event before the window doesn't count as a first visit in it", () => {
    const old = [{ id: "old", start: ago(400), doorUsed: true }, ...events];
    const stats = visitStats(old, [seat("old", "ana"), seat("oct", "ana")], NOW);

    expect(stats.secondVisit).toStrictEqual({ firstTimers: 0, returned: 0 });
    expect(stats.returning).toStrictEqual({ people: 1, before: 1 });
  });
});

describe(speakerStats, () => {
  test("new speakers are the ones never seen in the community before the window", () => {
    const events = [
      { start: ago(300), speakers: ["Ana Pérez"] },
      { start: ago(30), speakers: ["ana  perez", "Beto Gómez"] },
      { start: ago(10), speakers: ["Beto Gómez", "Caro Ruiz", ""] },
    ];

    expect(speakerStats(events, NOW - 182 * DAY)).toStrictEqual({ speakers: 3, new: 2, repeat: 1 });
  });
});

describe(quarterOf, () => {
  test("quarters read in Montevideo time", () => {
    expect(quarterOf("2026-10-01T02:00:00Z")).toBe("T3 2026");
    expect(quarterOf("2026-10-01T04:00:00Z")).toBe("T4 2026");
    expect(lastQuarters(5, NOW)).toStrictEqual(["T4 2025", "T1 2026", "T2 2026", "T3 2026", "T4 2026"]);
  });
});

describe(npsOf, () => {
  test("promoters minus detractors", () => {
    expect(npsOf([10, 9, 8, 6])).toBe(25);
    expect(npsOf([])).toBeNull();
  });
});
