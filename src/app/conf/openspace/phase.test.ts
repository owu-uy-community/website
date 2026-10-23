import { describe, expect, test } from "vitest";

import { dayState, MERCADO_SECONDS } from "./phase";

const TZ = "America/Montevideo";
const slot = (id: string, startTime: string, endTime: string) => ({
  id,
  name: id,
  startTime,
  endTime,
  date: "2026-11-07T00:00:00.000Z",
  isActive: true,
});
const BLOCKS = [slot("b1", "16:00", "16:25"), slot("b2", "16:30", "16:55"), slot("b5", "18:00", "18:25")];
const at = (when: string) => new Date(`${when}-03:00`);

describe(dayState, () => {
  test("the mercado is the 45 minutes before the first block, as on the agenda", () => {
    expect(MERCADO_SECONDS).toBe(45 * 60);
  });

  test("walks the afternoon: the day before, arrival, mercado, sessions (changeovers too), after", () => {
    const phaseAt = (when: string) => dayState(BLOCKS, TZ, at(when)).phase;

    expect(
      [
        "2026-11-06T16:00:00",
        "2026-11-07T14:30:00",
        "2026-11-07T15:15:00",
        "2026-11-07T16:00:00",
        "2026-11-07T16:27:00",
        "2026-11-07T18:25:00",
      ].map(phaseAt)
    ).toStrictEqual(["before-day", "arrival", "mercado", "sesiones", "sesiones", "after"]);
  });

  test("counts down to the mercado and to the first block", () => {
    expect(dayState(BLOCKS, TZ, at("2026-11-07T14:30:00"))).toMatchObject({
      secondsToMercado: 45 * 60,
      secondsToFirstBlock: 90 * 60,
    });
  });

  test("a board without blocks is still before the day", () => {
    expect(dayState([], TZ, at("2026-11-07T16:00:00"))).toStrictEqual({
      phase: "before-day",
      secondsToMercado: null,
      secondsToFirstBlock: null,
    });
  });
});
