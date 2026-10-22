/** Uruguay has had no DST since 2015: Montevideo is always UTC-3. */
export const MONTEVIDEO_OFFSET = "-03:00";
export const MONTEVIDEO_TZ = "America/Montevideo";

/**
 * A wall-clock time in Montevideo ("2026-10-22T19:00", "2026-10-22T19:00:00")
 * as a full ISO string. Values that already carry an offset or Z pass through.
 */
export function montevideoIso(value: string): string {
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(value)) return value;
  const withSeconds = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;

  return `${withSeconds}${MONTEVIDEO_OFFSET}`;
}

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-UY", { timeZone: MONTEVIDEO_TZ, ...options });

const weekday = formatter({ weekday: "short" });
const day = formatter({ day: "numeric" });
const month = formatter({ month: "short" });
const monthYear = formatter({ month: "long", year: "numeric" });
const time = formatter({ hour: "2-digit", minute: "2-digit", hour12: false });
const longDate = formatter({ weekday: "long", day: "numeric", month: "long" });

const clean = (value: string) => value.replace(/\.$/, "").toLowerCase();

/** Pieces of a date as shown on event rows, always in Montevideo time. */
export function dateParts(iso: string) {
  const date = new Date(iso);

  return {
    weekday: clean(weekday.format(date)),
    day: day.format(date),
    month: clean(month.format(date)),
    monthYear: monthYear.format(date),
    time: time.format(date),
    long: longDate.format(date),
  };
}

/** "2026-10" style key for grouping by month in Montevideo */
export function monthKey(iso: string) {
  const parts = formatter({ year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}`;
}

/** Calendar day key (YYYY-MM-DD) in Montevideo */
export function dayKey(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MONTEVIDEO_TZ }).format(new Date(iso));
}

/** "jue 12 nov · 19:00", the way the organizer panel and its emails name a moment. */
export function shortWhen(iso: string | Date) {
  const parts = dateParts(new Date(iso).toISOString());

  return `${parts.weekday} ${parts.day} ${parts.month} · ${parts.time}`;
}
