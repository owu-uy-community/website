import { describe, expect, test } from "vitest";

import { mentionsDate, pickRepeatDay, repeatDays, staleOnCopy, stillStale } from "./repeat";

describe(mentionsDate, () => {
  test("months, dates, years and edition numbers are dated; plain words aren't", () => {
    expect(
      [
        "Meetup de octubre",
        "Charlas del 12/11",
        "Cierre 2026",
        "Python MVD #7",
        "Edición 12",
        "Nº 3 de la serie",
        "Juntada 19 nov",
        "Charlas frente al mar",
        "Data set y pizza",
        null,
      ].map(mentionsDate)
    ).toStrictEqual([true, true, true, true, true, true, true, false, false, false]);
  });
});

describe(staleOnCopy, () => {
  const source = {
    name: "Meetup de noviembre",
    summary: "Tres charlas y pizza",
    description: "Nos vemos el 19/11",
    talks: [{ title: "Rust en producción", speaker: "Ana" }],
    rsvpClosesAt: new Date(),
    reminderNote: "Entrada por la puerta lateral",
  };

  test("dated texts, the talks, its close time and its note need a look", () => {
    expect(staleOnCopy(source)).toStrictEqual(["name", "description", "talks", "rsvpClosesAt", "reminderNote"]);
  });

  test("an evergreen copy has nothing to check", () => {
    expect(
      staleOnCopy({
        ...source,
        name: "Python MVD",
        description: null,
        talks: [],
        rsvpClosesAt: null,
        reminderNote: " ",
      })
    ).toStrictEqual([]);
  });
});

describe(stillStale, () => {
  test("a field leaves the list when it changes or someone says it's fine", () => {
    expect(stillStale(["name", "talks", "reminderNote"], ["talks"], ["reminderNote"])).toStrictEqual(["name"]);
  });
});

describe(repeatDays, () => {
  test("four weeks after, then a week later, then a week earlier: always the same weekday", () => {
    expect(repeatDays("2026-10-22", "2026-10-25")).toStrictEqual(["2026-11-19", "2026-11-26", "2026-11-12"]);
  });

  test("an old event repeats on the next same weekday at least four weeks after it that's still ahead", () => {
    expect(repeatDays("2026-06-04", "2026-10-23")).toStrictEqual(["2026-10-29", "2026-11-05"]);
  });
});

describe(pickRepeatDay, () => {
  test("the first day that's free or only needs care; the first one when all clash", () => {
    const levels = { "2026-11-19": "choca", "2026-11-26": "cuidado", "2026-11-12": "libre" } as const;

    expect([
      pickRepeatDay(["2026-11-19", "2026-11-26", "2026-11-12"], (day) => levels[day as keyof typeof levels]),
      pickRepeatDay(["2026-11-19"], () => "choca"),
    ]).toStrictEqual([
      { day: "2026-11-26", level: "cuidado" },
      { day: "2026-11-19", level: "choca" },
    ]);
  });
});
