/**
 * "Nuestro día": a community's usual slot (the 2nd Thursday at 19:00, the last Tuesday…). It's not
 * a recurrence engine: each occurrence is only a date the calendar weighs (softly, for others) and
 * a nudge for its team when nothing is planned that day. Pure, client-safe.
 */
import type { RecurringSlot } from "lib/db/schema";

import { addDays, weekdayOf } from "../calendar/holidays";

export type { RecurringSlot };

/** How far ahead the team hears about an empty occurrence: the email and Inicio. */
export const SLOT_NUDGE_DAYS = 42;
/** The email goes once, when the occurrence enters this last week before the six (see the sweep). */
export const SLOT_EMAIL_FROM_DAYS = 35;
/** For other communities, an occurrence weighs like a hold times this. */
export const SLOT_HOLD_FACTOR = 0.3;

export const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
/** 1–4, or -1 for the last one in the month */
export const NTH_OPTIONS = [
  { value: 1, label: "1.º" },
  { value: 2, label: "2.º" },
  { value: 3, label: "3.º" },
  { value: 4, label: "4.º" },
  { value: -1, label: "último" },
] as const;

/** The day the slot falls on in a month ("2026-11"), or null when it doesn't (never, for 1–4 and last). */
export function occurrenceIn(slot: Pick<RecurringSlot, "weekday" | "nth">, month: string): string | null {
  const first = `${month}-01`;
  const [year, index] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
  if (slot.nth === -1) return addDays(last, -((weekdayOf(last) - slot.weekday + 7) % 7));
  if (slot.nth < 1 || slot.nth > 4) return null;
  const day = addDays(first, ((slot.weekday - weekdayOf(first) + 7) % 7) + (slot.nth - 1) * 7);

  return day <= last ? day : null;
}

/** Every day the slot falls on from `from` to `to` (inclusive, "YYYY-MM-DD"). */
export function occurrences(slot: Pick<RecurringSlot, "weekday" | "nth">, from: string, to: string): string[] {
  const days: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = nextMonth(month)) {
    const day = occurrenceIn(slot, month);
    if (day && day >= from && day <= to) days.push(day);
  }

  return days;
}

const nextMonth = (month: string) => {
  const [year, index] = month.split("-").map(Number);

  return new Date(Date.UTC(year, index, 1)).toISOString().slice(0, 7);
};

/** "2.º jueves · 19:00", "último martes · 18:30". */
export function slotLabel(slot: RecurringSlot) {
  const nth = NTH_OPTIONS.find((option) => option.value === slot.nth)?.label ?? `${slot.nth}.º`;

  return `${nth} ${WEEKDAY_NAMES[slot.weekday]} · ${slot.time}`;
}

/** "jueves 13/11": how the nudge names an occurrence. */
export const occurrenceName = (day: string) =>
  `${WEEKDAY_NAMES[weekdayOf(day)]} ${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;
