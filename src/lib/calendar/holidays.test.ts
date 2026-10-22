import { describe, expect, test } from "vitest";

import { easter, uyHolidays } from "./holidays";

const compact = (year: number) => uyHolidays(year).map(({ day, kind, name }) => `${day} ${kind} ${name}`);

describe(easter, () => {
  test("finds Gregorian Easter Sunday", () => {
    expect([2025, 2026, 2027].map(easter)).toStrictEqual(["2025-04-20", "2026-04-05", "2027-03-28"]);
  });
});

/*
 * Moving rule: Ley 16.805 art. 1, exceptions in art. 2 as replaced by Ley 17.414.
 * https://www.gub.uy/ministerio-trabajo-seguridad-social/institucional/derecho-laboral-uruguayo/feriados
 * https://parlamento.gub.uy/documentosyleyes/leyes/ley/16805
 * https://parlamento.gub.uy/documentosyleyes/leyes/ley/17414
 * 2026 list (nothing moves: 19 Apr is a Sunday, 18 May and 12 Oct are Mondays):
 * https://www.montevideo.com.uy/Noticias/Feriados-2026-estos-son-los-laborables-y-no-laborables-del-proximo-ano-uc942569
 */
describe(uyHolidays, () => {
  test("lists 2026", () => {
    expect(compact(2026)).toStrictEqual([
      "2026-01-01 feriado Año Nuevo",
      "2026-01-06 laborable Día de Reyes",
      "2026-02-16 especial Carnaval",
      "2026-02-17 especial Carnaval",
      "2026-03-30 especial Semana de Turismo",
      "2026-03-31 especial Semana de Turismo",
      "2026-04-01 especial Semana de Turismo",
      "2026-04-02 especial Semana de Turismo",
      "2026-04-03 especial Semana de Turismo",
      "2026-04-19 laborable Desembarco de los 33 Orientales",
      "2026-05-01 feriado Día de los Trabajadores",
      "2026-05-18 laborable Batalla de Las Piedras",
      "2026-06-19 laborable Natalicio de Artigas",
      "2026-07-18 feriado Jura de la Constitución",
      "2026-08-25 feriado Declaratoria de la Independencia",
      "2026-10-12 laborable Día de la Diversidad Cultural",
      "2026-11-02 laborable Día de los Difuntos",
      "2026-12-25 feriado Navidad",
    ]);
  });

  test("lists 2027, with 18 May and 12 Oct (Tuesdays) moved to the Monday before", () => {
    expect(compact(2027)).toStrictEqual([
      "2027-01-01 feriado Año Nuevo",
      // A Wednesday, but 6 Jan is exempt
      "2027-01-06 laborable Día de Reyes",
      "2027-02-08 especial Carnaval",
      "2027-02-09 especial Carnaval",
      "2027-03-22 especial Semana de Turismo",
      "2027-03-23 especial Semana de Turismo",
      "2027-03-24 especial Semana de Turismo",
      "2027-03-25 especial Semana de Turismo",
      "2027-03-26 especial Semana de Turismo",
      "2027-04-19 laborable Desembarco de los 33 Orientales",
      "2027-05-01 feriado Día de los Trabajadores",
      "2027-05-17 laborable Batalla de Las Piedras",
      "2027-06-19 laborable Natalicio de Artigas",
      "2027-07-18 feriado Jura de la Constitución",
      "2027-08-25 feriado Declaratoria de la Independencia",
      "2027-10-11 laborable Día de la Diversidad Cultural",
      // A Tuesday, but 2 Nov is exempt
      "2027-11-02 laborable Día de los Difuntos",
      "2027-12-25 feriado Navidad",
    ]);
  });

  test("moves Tue/Wed holidays to the Monday before and Thu/Fri ones to the Monday after", () => {
    // 2028: 19 Apr is a Wednesday, 18 May a Thursday. 2029: Thursday and Friday.
    const moved = (year: number) =>
      uyHolidays(year)
        .filter(({ name }) => name === "Desembarco de los 33 Orientales" || name === "Batalla de Las Piedras")
        .map(({ day }) => day);
    expect(moved(2028)).toStrictEqual(["2028-04-17", "2028-05-22"]);
    expect(moved(2029)).toStrictEqual(["2029-04-23", "2029-05-21"]);
  });
});
