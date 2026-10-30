/**
 * "Repetir el último": what a copy of last month's event keeps, what it marks "Revisá", and the
 * date it proposes (same weekday and time, about four weeks later). Client-safe.
 */
import { addDays } from "../calendar/holidays";
import type { EventTalk } from "../db/schema";

/** The fields a copy may carry from the old date: they read "Revisá" until someone edits them. */
export const STALE_FIELDS = ["name", "summary", "description", "talks", "rsvpClosesAt", "reminderNote"] as const;
export type StaleField = (typeof STALE_FIELDS)[number];

export const STALE_LABEL: Record<StaleField, string> = {
  name: "el nombre",
  summary: "el resumen",
  description: "la descripción",
  talks: "las charlas",
  rsvpClosesAt: "el cierre de inscripción",
  reminderNote: "la nota del recordatorio",
};

const MONTHS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre";
/** Short months only after a day number ("12 nov"): alone, "mar" or "set" are just words */
const SHORT_MONTHS = "ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic";

/**
 * A text that names a date or a number of edition: "de octubre", "12 nov", "12/11", "2026", "#7",
 * "N° 7", "edición 7". Copied to next month, it would say the wrong thing.
 */
const DATED = new RegExp(
  [
    `\\b(${MONTHS})\\b`,
    `\\b\\d{1,2}\\s(de\\s)?(${SHORT_MONTHS})\\b`,
    String.raw`\b\d{1,2}[/.-]\d{1,2}\b`,
    String.raw`\b(19|20)\d{2}\b`,
    String.raw`#\s?\d+`,
    String.raw`\bn(ro|°|º|\.)\s?\d+`,
    String.raw`\bedici[oó]n\s+\d+`,
  ].join("|"),
  "i"
);

export const mentionsDate = (text: string | null | undefined) => DATED.test(text ?? "");

/** What a copy of `source` should flag: dated texts, its talks, its own close time and note. */
export function staleOnCopy(source: {
  name: string;
  summary: string | null;
  description: string | null;
  talks: readonly EventTalk[];
  rsvpClosesAt: Date | string | null;
  reminderNote: string | null;
}): StaleField[] {
  return STALE_FIELDS.filter((field) => {
    if (field === "talks") return source.talks.some((talk) => talk.title.trim());
    if (field === "rsvpClosesAt") return source.rsvpClosesAt !== null;
    if (field === "reminderNote") return Boolean(source.reminderNote?.trim());

    return mentionsDate(source[field]);
  });
}

/** A save took these fields away from "Revisá": the ones it changed, and the ones marked as fine as they are. */
export const stillStale = (stale: readonly string[], changed: readonly string[], reviewed: readonly string[] = []) =>
  stale.filter((field) => !changed.includes(field) && !reviewed.includes(field));

/** Weeks between a monthly meetup and the next */
export const REPEAT_WEEKS = 4;

/**
 * The days a repeat could go on, best first: four weeks after the source (moved on by weeks
 * until it's after `today`), then a week later, then a week earlier when that's still ahead.
 * Always the source's weekday.
 */
export function repeatDays(sourceDay: string, today: string) {
  let target = addDays(sourceDay, REPEAT_WEEKS * 7);
  while (target <= today) target = addDays(target, 7);
  const earlier = addDays(target, -7);

  return [target, addDays(target, 7), ...(earlier > today ? [earlier] : [])];
}

export type DayLevel = "libre" | "cuidado" | "choca" | "bloqueado";

/** The first candidate the calendar finds free or worth a look ("cuidado"); the first one otherwise. */
export function pickRepeatDay(candidates: readonly string[], level: (day: string) => DayLevel | undefined) {
  const fine = candidates.find((day) => level(day) === "libre" || level(day) === "cuidado");

  return { day: fine ?? candidates[0], level: level(fine ?? candidates[0]) ?? "libre" };
}

export const LEVEL_LABEL: Record<DayLevel, string> = {
  libre: "Libre",
  cuidado: "Con cuidado",
  choca: "Choca",
  bloqueado: "Bloqueado",
};
