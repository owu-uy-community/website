/**
 * When a meetup starts and how long it lasts, as the calendar, the date picker and the space
 * requests offer them: any quarter hour, from one hour to a whole day. Client-safe.
 */
import { clockTime, montevideoIso } from "lib/community/time";

/** Until the community has a habit of its own ("Lo de siempre") */
export const DEFAULT_START = "19:00";
export const DEFAULT_DURATION = 120;
/** Start times move in quarter hours (the native time input's `step`, in seconds) */
export const TIME_STEP_SECONDS = 15 * 60;
/** A hackathon or a conference day: the longest a date takes (DurationSchema's cap) */
export const ALL_DAY_MIN = 12 * 60;

/** The lengths offered, from a short talk to a Saturday workshop, then a whole day. */
export const DURATIONS = [60, 90, 120, 150, 180, 240, 300, 360, 480, 600, ALL_DAY_MIN] as const;

/** "1 h", "1 h 30", "6 h", "Todo el día (12 h)". */
export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const label = `${hours ? `${hours} h` : ""}${hours && rest ? " " : ""}${rest ? `${rest}${hours ? "" : " min"}` : ""}`;

  return minutes === ALL_DAY_MIN ? `Todo el día (${label})` : label;
}

/** "19:00", "10:15": a start time on the quarter-hour grid. */
export const isStartTime = (value: string | null | undefined): value is string =>
  /^([01]\d|2[0-3]):(00|15|30|45)$/.test(value ?? "");

/** 30 minutes to a whole day, in quarter hours. */
export const isDuration = (value: number) =>
  Number.isInteger(value) && value >= 30 && value <= ALL_DAY_MIN && value % 15 === 0;

/** The durations to offer, with the one in use when it's not a usual one (an event of 75 minutes). */
export const durationsWith = (current: number) =>
  DURATIONS.includes(current as (typeof DURATIONS)[number])
    ? [...DURATIONS]
    : [...DURATIONS, current].toSorted((a, b) => a - b);

/** "21:00": when a meetup that starts at `startTime` on `day` (Montevideo) ends. */
export const endTime = (day: string, startTime: string, durationMin: number) =>
  clockTime(new Date(Date.parse(montevideoIso(`${day}T${startTime}`)) + durationMin * 60_000));

/** The most common of a few start times (in a tie, either); null without any. */
export function usualStart(starts: string[]) {
  const counts = new Map<string, number>();
  for (const start of starts) counts.set(start, (counts.get(start) ?? 0) + 1);
  let best: string | null = null;
  for (const [start, count] of counts) if (best === null || count >= (counts.get(best) ?? 0)) best = start;

  return best;
}

/** Day keys ("2026-11-12") are calendar days: formatted at noon UTC, no time zone moves them. */
const onDay = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-UY", { timeZone: "UTC", ...options })
    .format(new Date(`${day}T12:00:00Z`))
    .replaceAll(".", "")
    .toLowerCase();

/** "jueves 12 de noviembre" (lowercase, as the RAE writes days and months). */
export const longDay = (day: string) => onDay(day, { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
/** "jue 12 nov" */
export const shortDay = (day: string) =>
  `${onDay(day, { weekday: "short" })} ${Number(day.slice(8))} ${onDay(day, { month: "short" })}`;
/** "noviembre de 2026" */
export const monthTitle = (month: string) => onDay(`${month}-15`, { month: "long", year: "numeric" });
