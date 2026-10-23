import { describe, expect, test } from "vitest";

import { heavyLoad, moved, nudgeDay, planTemplate, templateFor, templateTask } from "./task-templates";

// Thursday 19 November 2026, 19:00 in Montevideo
const START = "2026-11-19T22:00:00.000Z";

describe(planTemplate, () => {
  test("a talk night's tasks fall on Montevideo days counted from the start", () => {
    const plan = planTemplate("charlas", START);

    expect(plan.map((task) => [task.templateKey, task.day])).toStrictEqual([
      ["charlas:lugar", "2026-10-20"],
      ["charlas:charlas", "2026-10-29"],
      ["charlas:anunciar", "2026-10-29"],
      ["charlas:mano", "2026-11-12"],
      ["charlas:puerta", "2026-11-16"],
      ["charlas:comida", "2026-11-17"],
      ["charlas:slides", "2026-11-18"],
      ["charlas:gracias", "2026-11-20"],
    ]);
  });

  test("an event late at night in Montevideo is still on its Montevideo day (UTC is already tomorrow)", () => {
    expect(planTemplate("social", "2026-11-20T02:30:00.000Z").at(-1)?.day).toBe("2026-11-20");
  });
});

describe(moved, () => {
  const tasks = [
    { id: "a", templateKey: "charlas:lugar", status: "pending", day: "2026-10-20" },
    { id: "b", templateKey: "charlas:comida", status: "done", day: "2026-11-17" },
    { id: "c", templateKey: null, status: "pending", day: "2026-11-01" },
    { id: "d", templateKey: "charlas:gracias", status: "in_progress", day: "2026-11-20" },
  ];

  test("a week later, pending template tasks move a week; done ones and hand-made ones stay", () => {
    expect(moved(tasks, "2026-11-26T22:00:00.000Z")).toStrictEqual([
      { id: "a", day: "2026-10-27" },
      { id: "d", day: "2026-11-27" },
    ]);
  });

  test("the same date moves nothing", () => {
    expect(moved(tasks, START)).toStrictEqual([]);
  });
});

describe(templateFor, () => {
  test("online first, then the format, then co-organized, else a talk night", () => {
    expect([
      templateFor({ mode: "online", format: "taller", cohosts: [] }),
      templateFor({ mode: "presencial", format: "hackathon", cohosts: [] }),
      templateFor({ mode: "presencial", format: "social", cohosts: [{}] }),
      templateFor({ mode: "hibrido", format: "charlas", cohosts: [{}] }),
      templateFor({ mode: "presencial", format: null, cohosts: [] }),
    ]).toStrictEqual(["online", "taller", "social", "coorganizado", "charlas"]);
  });

  test("a key reads back its task; a hand-made task has none", () => {
    expect([templateTask("taller:requisitos")?.offsetDays, templateTask(null), templateTask("x:y")]).toStrictEqual([
      -3,
      null,
      null,
    ]);
  });
});

describe(heavyLoad, () => {
  test("more than 70% of at least six done tasks by one person is a hint; less, or fewer tasks, isn't", () => {
    expect([
      heavyLoad(["ana", "ana", "ana", "ana", "ana", "beto"]),
      heavyLoad(["ana", "ana", "ana", "ana", "beto", "beto"]),
      heavyLoad(["ana", "ana", "ana", "ana", "ana"]),
      heavyLoad(["ana", "ana", "ana", "ana", "ana", null, null]),
    ]).toStrictEqual([{ userId: "ana", share: 5 / 6 }, null, null, null]);
  });
});

describe(nudgeDay, () => {
  test("from 09:00 Montevideo it's today; before that, still yesterday", () => {
    expect([
      nudgeDay(new Date("2026-11-19T12:00:00.000Z")),
      nudgeDay(new Date("2026-11-19T11:59:00.000Z")),
    ]).toStrictEqual(["2026-11-19", "2026-11-18"]);
  });
});
