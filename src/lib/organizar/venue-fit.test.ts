import { describe, expect, test } from "vitest";

import { fullMonths, rankVenues, venueFit, type FitVenue } from "./venue-fit";

const NOW = Date.parse("2026-10-01T12:00:00-03:00");

const space = (overrides: Partial<FitVenue> = {}): FitVenue => ({
  capacity: 80,
  amenities: ["proyector", "wifi"],
  hostDays: [],
  leadDays: 14,
  monthlyCap: null,
  requestable: true,
  fallback: false,
  hostedUs: 0,
  lastHostedAt: null,
  responseRate: null,
  ...overrides,
});

const want = { size: "30-60" as const, needs: ["proyector"], day: "2026-11-12" };

describe(venueFit, () => {
  test("a space that fits has no blockers; each limit says why it doesn't", () => {
    expect(venueFit(space(), want, { busy: [] }, NOW).blockers).toStrictEqual([]);
    expect(
      venueFit(space({ capacity: 40, hostDays: [2], leadDays: 60 }), want, { busy: [] }, NOW).blockers
    ).toStrictEqual(["Recibe los martes", "Pide 60 días de anticipación", "Entran 40"]);
    expect(venueFit(space({ monthlyCap: 1 }), want, { busy: ["2026-11-03"] }, NOW).blockers).toStrictEqual([
      "Ya recibe todo lo que puede ese mes",
    ]);
  });

  test("the space that hosted least recently and covers the needs ranks first; Plan B always last", () => {
    const fresh = { id: "fresh", fallback: false, fit: venueFit(space(), want, { busy: [] }, NOW) };
    const recent = {
      id: "recent",
      fallback: false,
      fit: venueFit(space({ lastHostedAt: "2026-09-20T22:00:00Z" }), want, { busy: [] }, NOW),
    };
    const noProjector = {
      id: "bare",
      fallback: false,
      fit: venueFit(space({ amenities: [] }), want, { busy: [] }, NOW),
    };
    const busy = { id: "busy", fallback: false, fit: venueFit(space(), want, { busy: ["2026-11-12"] }, NOW) };
    const planB = { id: "plan-b", fallback: true, fit: venueFit(space({ fallback: true }), want, { busy: [] }, NOW) };

    expect(rankVenues([planB, busy, noProjector, recent, fresh]).map((venue) => venue.id)).toStrictEqual([
      "fresh",
      "recent",
      "bare",
      "busy",
      "plan-b",
    ]);
  });
});

describe(fullMonths, () => {
  test("months whose hosted days reach the cap", () => {
    expect(fullMonths(["2026-11-03", "2026-11-20", "2026-12-01"], 2)).toStrictEqual(["2026-11"]);
    expect(fullMonths(["2026-11-03"], null)).toStrictEqual([]);
  });
});
