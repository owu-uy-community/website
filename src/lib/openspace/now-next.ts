import { slotDay, wallClock } from "../slot-day";

/**
 * Which block is running right now and which one is next, from the event's own slots: the live
 * board needs no extra query or channel for it, and recomputes it every second on its own.
 *
 * Everything is compared as the venue's wall clock ("YYYY-MM-DDTHH:MM:SS" in the event's time
 * zone), which keeps the 5-minute changeovers, a board that crosses midnight and a visitor in
 * another time zone on one code path.
 */

export type NowNextSlot = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  date: string;
  isActive: boolean;
};

export type OpenSpacePhase = "before" | "running" | "break" | "after";

export type NowNext<T extends NowNextSlot> = {
  phase: OpenSpacePhase;
  /** The block on now; null during a changeover, before or after. */
  current: T | null;
  /** The next block that hasn't started; null once the last one has. */
  next: T | null;
  /** Seconds until the current block ends, or until the next one starts. */
  secondsUntilChange: number | null;
};

/** A wall-clock stamp as seconds, read as if it were UTC: only differences between stamps matter. */
export function stampSeconds(stamp: string): number {
  const [day, time] = stamp.split("T");
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);

  return Date.UTC(year, month - 1, date, hour, minute, second) / 1_000;
}

/** The venue's wall clock at `at`, to the second (zone offsets are whole minutes, so the seconds are the instant's). */
export function wallClockSeconds(at: Date, timezone: string): string {
  return `${wallClock(at, timezone)}:${String(at.getUTCSeconds()).padStart(2, "0")}`;
}

export function resolveNowNext<T extends NowNextSlot>(
  slots: readonly T[],
  timezone: string,
  at: Date = new Date()
): NowNext<T> {
  const now = wallClockSeconds(at, timezone);

  const ordered = slots
    .filter((slot) => slot.isActive)
    .map((slot) => ({
      slot,
      start: `${slotDay(slot.date)}T${slot.startTime}:00`,
      end: `${slotDay(slot.date)}T${slot.endTime}:00`,
    }))
    .toSorted((a, b) => a.start.localeCompare(b.start));

  if (ordered.length === 0) return { phase: "before", current: null, next: null, secondsUntilChange: null };

  const current = ordered.find((entry) => entry.start <= now && now < entry.end) ?? null;
  const next = ordered.find((entry) => entry.start > now) ?? null;
  const phase: OpenSpacePhase = current ? "running" : next ? (now < ordered[0].start ? "before" : "break") : "after";
  const boundary = current?.end ?? next?.start ?? null;

  return {
    phase,
    current: current?.slot ?? null,
    next: next?.slot ?? null,
    secondsUntilChange: boundary ? Math.max(0, stampSeconds(boundary) - stampSeconds(now)) : null,
  };
}
