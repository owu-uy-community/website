export type Holiday = {
  /** "YYYY-MM-DD", the day it is observed */
  day: string;
  name: string;
  /** feriado: paid day off (Ley 12.590); laborable: a working holiday; especial: Carnaval and Turismo */
  kind: "feriado" | "laborable" | "especial";
};

const DAY_MS = 86_400_000;

/** A calendar day "YYYY-MM-DD" moved by `days`; UTC math, so no time zone can shift it. */
export const addDays = (day: string, days: number) =>
  new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);

/** Day of the week of "YYYY-MM-DD", 0 = Sunday … 6 = Saturday */
export const weekdayOf = (day: string) => new Date(Date.parse(day)).getUTCDay();

/** Whole days from `from` to `to`, both "YYYY-MM-DD" */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Gregorian Easter Sunday (anonymous computus) as "YYYY-MM-DD" */
export function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Ley 16.805 art. 1: a holiday on Tue/Wed is observed the Monday before, on
 * Thu/Fri the Monday after; Sat, Sun and Mon stay. Indexed by weekday.
 */
const TO_MONDAY = [0, 0, -1, -2, 4, 3, 0];

/**
 * Holidays on a fixed date. `moves` marks the ones Ley 16.805 art. 1 moves to a
 * Monday: every holiday except those art. 2 (as replaced by Ley 17.414) exempts,
 * namely Carnaval, Turismo, 1 and 6 Jan, 1 May, 19 Jun, 18 Jul, 25 Aug, 2 Nov and 25 Dec.
 * https://www.gub.uy/ministerio-trabajo-seguridad-social/institucional/derecho-laboral-uruguayo/feriados
 */
const FIXED: { date: string; name: string; kind: Holiday["kind"]; moves?: true }[] = [
  { date: "01-01", name: "Año Nuevo", kind: "feriado" },
  { date: "01-06", name: "Día de Reyes", kind: "laborable" },
  { date: "04-19", name: "Desembarco de los 33 Orientales", kind: "laborable", moves: true },
  { date: "05-01", name: "Día de los Trabajadores", kind: "feriado" },
  { date: "05-18", name: "Batalla de Las Piedras", kind: "laborable", moves: true },
  { date: "06-19", name: "Natalicio de Artigas", kind: "laborable" },
  { date: "07-18", name: "Jura de la Constitución", kind: "feriado" },
  { date: "08-25", name: "Declaratoria de la Independencia", kind: "feriado" },
  { date: "10-12", name: "Día de la Diversidad Cultural", kind: "laborable", moves: true },
  { date: "11-02", name: "Día de los Difuntos", kind: "laborable" },
  { date: "12-25", name: "Navidad", kind: "feriado" },
];

/** Uruguay's national holidays for a year, by observed day */
export function uyHolidays(year: number): Holiday[] {
  const fixed = FIXED.map(({ date, name, kind, moves }): Holiday => {
    const day = `${year}-${date}`;

    return { day: moves ? addDays(day, TO_MONDAY[weekdayOf(day)]) : day, name, kind };
  });
  const sunday = easter(year);
  const carnaval = [-48, -47].map((offset): Holiday => ({
    day: addDays(sunday, offset),
    name: "Carnaval",
    kind: "especial",
  }));
  const turismo = [-6, -5, -4, -3, -2].map((offset): Holiday => ({
    day: addDays(sunday, offset),
    name: "Semana de Turismo",
    kind: "especial",
  }));

  return [...fixed, ...carnaval, ...turismo].sort((a, b) => a.day.localeCompare(b.day));
}
