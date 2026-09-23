/**
 * Which block is running right now, and which one is next — derived from the
 * event's own schedules so the live view needs no extra query and no extra
 * realtime channel.
 *
 * Everything is compared as a "YYYY-MM-DDTHH:MM" string in the event's
 * timezone. That keeps the 5-minute gaps between blocks, an open space that
 * spans midnight, and a visitor sitting in another timezone all on one code
 * path, without pulling in a date library.
 */

export type NowNextSlot = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  date: string | Date;
  isActive: boolean;
};

export type OpenSpacePhase = "before" | "running" | "break" | "after";

export type NowNext<T extends NowNextSlot> = {
  phase: OpenSpacePhase;
  /** The block happening right now; null during a break, before, or after. */
  current: T | null;
  /** The next block that has not started yet; null once the last one ends. */
  next: T | null;
  /** Seconds until the current block ends, or until the next one starts. */
  secondsUntilChange: number | null;
};

/** "9:5" and "09:05" are the same minute; the board's inputs are not strict. */
function normalizeTime(time: string): string {
  const [hour = "0", minute = "0"] = time.split(":");

  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** Day marker of a schedule row, which arrives as a Date server-side and an ISO string over the wire. */
function dayOf(date: string | Date): string {
  return (typeof date === "string" ? date : date.toISOString()).slice(0, 10);
}

/** Wall-clock "YYYY-MM-DDTHH:MM" at `at`, as read in `timezone`. */
export function wallClockIn(timezone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/** Seconds between two "YYYY-MM-DDTHH:MM:SS" stamps, treating both as wall clock. */
function secondsBetween(from: string, to: string): number {
  const toSeconds = (stamp: string) => {
    const [day, time] = stamp.split("T");
    const [year, month, date] = day.split("-").map(Number);
    const [hour, minute, second = 0] = time.split(":").map(Number);

    return Date.UTC(year, month - 1, date, hour, minute, second) / 1_000;
  };

  return toSeconds(to) - toSeconds(from);
}

export function resolveNowNext<T extends NowNextSlot>(
  slots: readonly T[],
  timezone: string,
  at: Date = new Date()
): NowNext<T> {
  const now = wallClockIn(timezone, at);

  const ordered = slots
    .filter((slot) => slot.isActive)
    .map((slot) => ({
      slot,
      start: `${dayOf(slot.date)}T${normalizeTime(slot.startTime)}:00`,
      end: `${dayOf(slot.date)}T${normalizeTime(slot.endTime)}:00`,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (ordered.length === 0) return { phase: "before", current: null, next: null, secondsUntilChange: null };

  const current = ordered.find((entry) => entry.start <= now && now < entry.end) ?? null;
  const next = ordered.find((entry) => entry.start > now) ?? null;

  const phase: OpenSpacePhase = current ? "running" : next ? (now < ordered[0].start ? "before" : "break") : "after";

  const boundary = current?.end ?? next?.start ?? null;

  return {
    phase,
    current: current?.slot ?? null,
    next: next?.slot ?? null,
    secondsUntilChange: boundary ? Math.max(0, Math.round(secondsBetween(now, boundary))) : null,
  };
}
