import { dayKey, MONTEVIDEO_TZ } from "../community/time";

/**
 * The followers' weekly digest: when it goes out and which week a send belongs to. Client-safe.
 */

/** How far ahead the digest looks */
export const DIGEST_DAYS = 14;
/** Monday, from this hour (local): the tick that runs then sends it; later ticks that Monday catch up */
export const DIGEST_HOUR = 9;

/** "2026-W43": the ISO week of a moment, in `timeZone`. One digest per person and week. */
export function isoWeek(at: Date, timeZone = MONTEVIDEO_TZ) {
  const [year, month, day] = dayKey(at, timeZone).split("-").map(Number);
  const thursday = new Date(Date.UTC(year, month - 1, day));
  // The Thursday of the week decides its year (ISO 8601)
  thursday.setUTCDate(day + 3 - ((thursday.getUTCDay() + 6) % 7));
  const week = Math.ceil(((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);

  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Is it digest time: Monday from DIGEST_HOUR, local time? */
export function digestDue(at: Date, timeZone = MONTEVIDEO_TZ) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;

  return part("weekday") === "Mon" && Number(part("hour")) >= DIGEST_HOUR;
}
