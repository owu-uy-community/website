/**
 * Event-local dates. The staff board is day-scoped ("YYYY-MM-DD") and the
 * conf-day schedules fire on UTC crons, so both need "what day is it *there*"
 * rather than whatever the runtime's clock says.
 */

export const EVENT_TIMEZONE = process.env.OWY_EVENT_TIMEZONE ?? "America/Montevideo";

/** Today at the event, as "YYYY-MM-DD" (en-CA formats that way natively). */
export function eventToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current wall-clock time at the event, as "HH:MM". */
export function eventNowTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: EVENT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}
