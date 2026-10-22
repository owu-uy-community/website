import { describe, expect, test } from "vitest";

import { projectDay, rundownStatus, toMinutes } from "./timing";

const moment = (
  id: string,
  plannedStart: string,
  durationMin: number,
  extra: { fixed?: boolean; actualStart?: string; actualEnd?: string } = {}
) => ({ id, title: id, plannedStart, durationMin, fixed: false, actualStart: null, actualEnd: null, ...extra });

describe(rundownStatus, () => {
  test("next is the first unstarted moment after the running one; ones a GO jumped over are skipped", () => {
    const { live, next, status } = rundownStatus([
      moment("puertas", "14:30", 30, { actualStart: "x", actualEnd: "y" }),
      moment("bienvenida", "15:00", 15),
      moment("mercado", "15:15", 45, { actualStart: "z" }),
      moment("bloque", "16:00", 25),
    ]);

    expect({ live, next, status }).toStrictEqual({ live: 2, next: 3, status: ["done", "skipped", "live", "next"] });
  });
});

describe(projectDay, () => {
  test("a late stretch eats into the fixed start, and the hint trims the last moment that can give it back", () => {
    const day = [
      moment("bloque 5", "18:00", 25, { actualStart: "x" }),
      moment("coffee break", "18:25", 35),
      moment("aviso", "18:59", 0),
      moment("charla", "19:00", 40, { fixed: true }),
      moment("despedida", "19:40", 15),
    ];

    // Bloque 5 started 4 late: it ends 18:29, the coffee break at 19:04.
    expect(projectDay(day, toMinutes("18:10"), toMinutes("18:04"))).toStrictEqual({
      nextFixed: { index: 3, marginMin: -4 },
      overruns: [{ index: 2, fixedIndex: 3, overMin: 4, trim: { index: 1, durationMin: 31 } }],
    });
  });

  test("off the day it is the plan: the margin is the slack the plan leaves", () => {
    const day = [moment("coffee break", "18:25", 25), moment("charla", "19:00", 40, { fixed: true })];

    expect(projectDay(day, null, null)).toStrictEqual({ nextFixed: { index: 1, marginMin: 10 }, overruns: [] });
  });
});
