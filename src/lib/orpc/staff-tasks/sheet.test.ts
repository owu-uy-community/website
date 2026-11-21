import { describe, expect, test } from "vitest";

import { parseSheet, splitCells, taskKey } from "./sheet";

const roster = [
  { userId: "u-juan-oliu", name: "Juan Oliú", image: null },
  { userId: "u-juan-diana", name: "Juan Diana", image: null },
  { userId: "u-valentina", name: "Valentina Olivera", image: null },
  { userId: "u-tomas", name: "Tomás Piaggio", image: null },
];
const parse = (text: string) => parseSheet(text, { roster, defaultDay: "2026-11-07" });

describe(splitCells, () => {
  test("a copy from Google Sheets is tab-separated, with quoted cells holding line breaks and quotes", () => {
    const text = 'Tarea\tNotas\nArmar\t"Primero las mesas,\nluego las ""sillas"""\n\nCafé\t';

    expect(splitCells(text)).toStrictEqual([
      { line: 1, cells: ["Tarea", "Notas"] },
      { line: 2, cells: ["Armar", 'Primero las mesas,\nluego las "sillas"'] },
      { line: 5, cells: ["Café", ""] },
    ]);
  });

  test("without tabs it reads commas, and Windows line ends", () => {
    expect(splitCells('a,"b, c"\r\nd,e')).toStrictEqual([
      { line: 1, cells: ["a", "b, c"] },
      { line: 2, cells: ["d", "e"] },
    ]);
  });
});

describe(parseSheet, () => {
  test("reads the usual columns by their header, in any order, with people matched by name", () => {
    const [row] = parse(
      "Personas\tTarea\tTipo\tDía\tInicio\tFin\tMín.\tLugar\tNotas\n" +
        "Juan Oliú, Vale y Tomás\tAcreditación\tTarea\t7/11/2026\t14\t15.30\t3\tEntrada\tCon lista impresa"
    );

    expect(row).toStrictEqual({
      line: 2,
      title: "Acreditación",
      type: "task",
      dayDate: "2026-11-07",
      startTime: "14:00",
      endTime: "15:30",
      minPeople: 3,
      location: "Entrada",
      notes: "Con lista impresa",
      people: [roster[0], roster[2], roster[3]],
      errors: [],
    });
  });

  test("without a header the columns follow the sheet's usual order, and an empty day is the event's", () => {
    const [row] = parse("Coffee break\tcontinua\t\t18:25\t19:00");

    expect(row).toMatchObject({ title: "Coffee break", type: "ongoing", dayDate: "2026-11-07", startTime: "18:25" });
  });

  test("days come as ISO, d/m, or written in Spanish", () => {
    const days = parse("Tarea\tDía\nA\t2026-11-08\nB\t8/11\nC\tsáb 7 nov\nD\t1 de setiembre de 2027").map(
      (row) => row.dayDate
    );

    expect(days).toStrictEqual(["2026-11-08", "2026-11-08", "2026-11-07", "2027-09-01"]);
  });

  test("each row says what is wrong with it, in Spanish", () => {
    const rows = parse(
      "Tarea\tTipo\tDía\tInicio\tFin\tMín\tPersonas\n" +
        "\tfiesta\t31/02\t25:00\t\t0\tNadie\n" +
        "Cierre\ttarea\t\t20:00\t19:00\t\tJuan\n" +
        "Bienvenida\thito\t\t15:00\t15:15\t\t"
    );

    expect(rows.map((row) => row.errors)).toStrictEqual([
      [
        "Falta el nombre de la tarea",
        "Tipo «fiesta»: usá tarea, continua o hito",
        "Día «31/02»: usá 7/11/2026",
        "Inicio «25:00»: usá 14:30",
        "Mín «0»: un número del 1 al 99",
        "No encontramos a «Nadie» en el staff",
      ],
      ["«Juan» puede ser Juan Oliú o Juan Diana", "Termina antes de empezar (20:00–19:00)"],
      ["Un hito es solo un momento: va sin fin, sin mínimo y sin personas"],
    ]);
  });

  test("the same task is recognised whatever its case or accents", () => {
    expect(taskKey({ dayDate: "2026-11-07", startTime: "14:00", title: "Acreditación" })).toBe(
      taskKey({ dayDate: "2026-11-07", startTime: "14:00", title: "ACREDITACION " })
    );
  });
});
