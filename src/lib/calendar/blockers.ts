export type Blocker = {
  /** First and last day, inclusive, "YYYY-MM-DD" */
  from: string;
  to: string;
  /** Shown as the reason, so it reads as a sentence on its own */
  name: string;
  kind: "vacaciones" | "futbol" | "elecciones" | "verano" | "otro";
  /** Score penalty on each day of the period */
  weight: number;
};

/**
 * Periods that thin out a meetup's audience, edited by PR.
 *
 * - Vacaciones: ANEP's calendar for public schools (Inicial, Primaria, Secundaria, UTU).
 *   2026 approved by Codicen in Dec 2025. TODO: add 2027 once Codicen approves it (usually December).
 * - Fútbol: FIFA international windows. Uruguay co-hosts 2030, so these are friendlies: low weight.
 * - Elecciones: none until the October 2029 national election, so nothing here for 2026–2027.
 * - Verano: see `summer()`, every year.
 */
export const BLOCKERS: Blocker[] = [
  { from: "2026-06-29", to: "2026-07-03", name: "Vacaciones de julio", kind: "vacaciones", weight: 10 },
  { from: "2026-09-21", to: "2026-09-25", name: "Vacaciones de primavera", kind: "vacaciones", weight: 10 },
  { from: "2026-11-09", to: "2026-11-17", name: "Fecha FIFA: puede jugar Uruguay", kind: "futbol", weight: 5 },
  { from: "2027-03-22", to: "2027-03-30", name: "Fecha FIFA: puede jugar Uruguay", kind: "futbol", weight: 5 },
  { from: "2027-06-07", to: "2027-06-15", name: "Fecha FIFA: puede jugar Uruguay", kind: "futbol", weight: 5 },
];

/** Uruguay's summer break, 20 Dec – 31 Jan of any year: half the audience is at the beach. */
export function summer(day: string) {
  const monthDay = day.slice(5);

  return monthDay >= "12-20" || monthDay <= "01-31";
}
