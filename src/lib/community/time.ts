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

const cache = new Map<string, Intl.DateTimeFormat>();
/** es-UY formatters per time zone (every OWU event is in Montevideo; `events.timezone` can say otherwise). */
const formatter = (options: Intl.DateTimeFormatOptions, timeZone = MONTEVIDEO_TZ) => {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let format = cache.get(key);
  if (!format) cache.set(key, (format = new Intl.DateTimeFormat("es-UY", { timeZone, ...options })));

  return format;
};

// h23, never hour12: false, which renders midnight as "24:00" in some engines. es-UY's default is "7:00 p. m.".
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

const clean = (value: string) => value.replace(/\.$/, "").toLowerCase();

/** Pieces of a date as shown on event rows, in Montevideo time unless the event says otherwise. */
export function dateParts(iso: string | Date, timeZone = MONTEVIDEO_TZ) {
  const date = new Date(iso);

  return {
    weekday: clean(formatter({ weekday: "short" }, timeZone).format(date)),
    day: formatter({ day: "numeric" }, timeZone).format(date),
    month: clean(formatter({ month: "short" }, timeZone).format(date)),
    monthYear: formatter({ month: "long", year: "numeric" }, timeZone).format(date),
    time: formatter(TIME, timeZone).format(date),
    long: formatter({ weekday: "long", day: "numeric", month: "long" }, timeZone).format(date),
  };
}

/** "19:00": a wall-clock time, 24 h. */
export const clockTime = (iso: string | Date, timeZone = MONTEVIDEO_TZ) =>
  formatter(TIME, timeZone).format(new Date(iso));

/** "2026-10" style key for grouping by month in Montevideo */
export function monthKey(iso: string) {
  const parts = formatter({ year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}`;
}

/** Calendar day key (YYYY-MM-DD) in Montevideo */
export function dayKey(iso: string | Date, timeZone = MONTEVIDEO_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/** "jue 12 nov · 19:00", the way the organizer panel and its emails name a moment. */
export function shortWhen(iso: string | Date, timeZone = MONTEVIDEO_TZ) {
  const parts = dateParts(iso, timeZone);

  return `${parts.weekday} ${parts.day} ${parts.month} · ${parts.time}`;
}
