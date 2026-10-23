import { describe, expect, test } from "vitest";

import { clockTime, dateParts, shortWhen } from "../community/time";
import { eventPhase } from "./rules";
import { headcount, plural } from "./words";

describe("words", () => {
  test("plural agrees with the count", () => {
    expect([0, 1, 2].map((n) => plural(n, "comunidad", "comunidades"))).toStrictEqual([
      "0 comunidades",
      "1 comunidad",
      "2 comunidades",
    ]);
  });

  test("headcount names lugares, anotados and en espera apart", () => {
    const count = headcount({ attending: 36, guests: 2, offered: 1, waitlisted: 6, pending: 0 }, 40);
    expect([count.seatsLabel, count.attendingLabel, count.waitlistLabel]).toStrictEqual([
      "39 de 40 lugares",
      "36 personas anotadas",
      "6 en espera",
    ]);
    expect(headcount({ attending: 1, guests: 0, offered: 0, waitlisted: 0, pending: 0 }, null).attendingLabel).toBe(
      "1 persona anotada"
    );
  });
});

describe("time", () => {
  // The runner's own zone must not matter: these are Montevideo wall-clock times
  test("times are 24 h in Montevideo, midnight included", () => {
    expect(clockTime("2026-11-05T22:00:00.000Z")).toBe("19:00");
    expect(clockTime("2026-11-06T03:00:00.000Z")).toBe("00:00");
    expect(shortWhen("2026-11-05T22:00:00.000Z")).toBe("jue 5 nov · 19:00");
    expect(dateParts("2026-11-05T22:00:00.000Z").time).not.toMatch(/m\./);
  });
});

describe(eventPhase, () => {
  const event = { startDate: "2026-11-05T22:00:00.000Z", endDate: "2026-11-06T00:00:00.000Z" };
  const at = (iso: string) => eventPhase(event, new Date(iso).getTime());

  test("the day opens an hour before and closes two hours after the end", () => {
    expect([
      at("2026-11-05T20:59:00.000Z"),
      at("2026-11-05T21:00:00.000Z"),
      at("2026-11-06T02:00:00.000Z"),
      at("2026-11-06T02:01:00.000Z"),
    ]).toStrictEqual(["antes", "dia", "dia", "despues"]);
  });
});
