/**
 * A time slot's day is a date-only value, stored as UTC midnight
 * ("2026-11-07T00:00:00.000Z"); its start and end are the venue's wall clock.
 * Never turn the day into a local Date: west of UTC, midnight UTC is the
 * evening before.
 */
export const slotDay = (date: string) => date.slice(0, 10);

const pad = (value: number) => String(value).padStart(2, "0");

/** "YYYY-MM-DD" and "HH:MM" of a local Date — on a screen at the venue, the venue's clock. */
const localDay = (now: Date) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const localTime = (now: Date) => `${pad(now.getHours())}:${pad(now.getMinutes())}`;

/** Whether a slot is on at `now`, read on the venue's clock. */
export const slotIsOn = (slot: { date: string; startTime: string; endTime: string }, now: Date) =>
  slotDay(slot.date) === localDay(now) && slot.startTime <= localTime(now) && localTime(now) < slot.endTime;

/** "YYYY-MM-DDTHH:MM" of an instant on a time zone's wall clock (an event's, on the server). Compares as a string. */
export const wallClock = (at: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
