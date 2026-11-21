import { describe, expect, test } from "vitest";

import { meetupAgenda, moveItem, withStarts } from "./agenda";

describe(meetupAgenda, () => {
  test("doors, welcome, talks by length, lightning talks together at the end, then networking", () => {
    const agenda = meetupAgenda([
      { title: "Relámpago uno", speaker: "Caro", format: "relampago" },
      { title: "Rust en producción", speaker: "Ana", format: "larga" },
      { title: "Typed by hand", speaker: "", format: null },
      { title: "  ", speaker: "Nadie", format: "corta" },
    ]);

    expect(agenda).toStrictEqual([
      { title: "Puertas abiertas y networking", durationMin: 30 },
      { title: "Bienvenida", durationMin: 5 },
      { title: "Rust en producción · Ana", durationMin: 40 },
      { title: "Typed by hand", durationMin: 20 },
      { title: "Relámpago: Relámpago uno · Caro", durationMin: 5 },
      { title: "Networking y cierre", durationMin: 30 },
    ]);
  });

  test("without talks it's still a night: doors, welcome and networking", () => {
    expect(meetupAgenda([]).map((item) => item.title)).toStrictEqual([
      "Puertas abiertas y networking",
      "Bienvenida",
      "Networking y cierre",
    ]);
  });
});

describe(withStarts, () => {
  test("each moment starts when the one before ends", () => {
    expect(
      withStarts(
        [
          { title: "a", durationMin: 30 },
          { title: "b", durationMin: 5 },
          { title: "c", durationMin: 40 },
        ],
        "19:00"
      ).map((item) => item.plannedStart)
    ).toStrictEqual(["19:00", "19:30", "19:35"]);
  });
});

describe(moveItem, () => {
  test("Subir and Bajar swap neighbours; at either end nothing moves", () => {
    expect([
      moveItem(["a", "b", "c"], 2, -1),
      moveItem(["a", "b", "c"], 0, -1),
      moveItem(["a", "b", "c"], 2, 1),
    ]).toStrictEqual([
      ["a", "c", "b"],
      ["a", "b", "c"],
      ["a", "b", "c"],
    ]);
  });
});
