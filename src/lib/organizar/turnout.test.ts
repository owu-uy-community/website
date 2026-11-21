import { describe, expect, test } from "vitest";

import { busFactorLow, healthOf } from "./health";
import { pacing } from "./pacing";
import { expectedTurnout, foodFor, suggestedLimit } from "./turnout";

describe(expectedTurnout, () => {
  test("without history it plans for 55% of sign-ups, as a range", () => {
    expect(expectedTurnout({ attending: 40, guests: 0, confirmed: 0, showRate: null })).toStrictEqual({
      likely: 22,
      low: 18,
      high: 26,
      rate: 0.55,
      fromHistory: false,
    });
  });

  test("people who confirmed count almost whole", () => {
    expect(expectedTurnout({ attending: 30, guests: 4, confirmed: 20, showRate: 0.6 }).likely).toBe(26);
  });
});

describe(foodFor, () => {
  test("pizzas, veggie, gluten-free and drinks for a few crowd sizes", () => {
    expect([10, 34, 61, 150].map((people) => foodFor(people))).toStrictEqual([
      { pizzas: 4, veggie: 1, glutenFree: 1, drinks: 20 },
      { pizzas: 12, veggie: 3, glutenFree: 1, drinks: 68 },
      { pizzas: 21, veggie: 6, glutenFree: 2, drinks: 122 },
      { pizzas: 52, veggie: 13, glutenFree: 3, drinks: 300 },
    ]);
    expect(foodFor(0).pizzas).toBe(0);
    expect(foodFor(20, { vegetarian: 12, glutenFree: 2 })).toStrictEqual({
      pizzas: 7,
      veggie: 4,
      glutenFree: 2,
      drinks: 40,
    });
  });

  test("a room for 40 takes about 72 sign-ups", () => {
    expect(suggestedLimit(40, null)).toBe(72);
  });
});

describe(healthOf, () => {
  const now = new Date("2026-10-23T12:00:00.000Z").getTime();
  const ago = (days: number) => new Date(now - days * 86_400_000);
  const base = { hasUpcoming: false, status: "activa", pausedUntil: null };

  test("from the last event: 60 days at risk, 180 dormant; anything ahead is active", () => {
    expect([59, 61, 179, 181].map((days) => healthOf({ ...base, lastEventAt: ago(days) }, now))).toStrictEqual([
      "activa",
      "en-riesgo",
      "en-riesgo",
      "dormida",
    ]);
    expect(healthOf({ ...base, lastEventAt: ago(400), hasUpcoming: true }, now)).toBe("activa");
    expect(healthOf({ ...base, lastEventAt: null }, now)).toBe("en-riesgo");
  });

  test("a declared pause holds until its date", () => {
    expect(healthOf({ ...base, lastEventAt: ago(400), status: "pausa", pausedUntil: "2026-12-01" }, now)).toBe(
      "en-pausa"
    );
    expect(healthOf({ ...base, lastEventAt: ago(400), status: "pausa", pausedUntil: "2026-10-01" }, now)).toBe(
      "dormida"
    );
    expect([busFactorLow(1), busFactorLow(2)]).toStrictEqual([true, false]);
  });
});

describe(pacing, () => {
  const now = new Date("2026-10-23T12:00:00.000Z").getTime();
  const inDays = (days: number) => new Date(now + days * 86_400_000);

  test("behind at two weeks below half the room, at one week below the room; never past the start", () => {
    expect(pacing({ capacity: 60, startDate: inDays(14) }, 12, now)).toStrictEqual({
      behind: true,
      daysLeft: 14,
      target: 30,
    });
    expect(pacing({ capacity: 60, startDate: inDays(14) }, 30, now)).toStrictEqual({ behind: false });
    expect(pacing({ capacity: 60, startDate: inDays(6) }, 50, now)).toStrictEqual({
      behind: true,
      daysLeft: 6,
      target: 60,
    });
    expect(pacing({ capacity: 60, startDate: inDays(20) }, 0, now)).toStrictEqual({ behind: false });
    expect(pacing({ capacity: null, startDate: inDays(3) }, 0, now)).toStrictEqual({ behind: false });
  });
});
