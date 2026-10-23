/**
 * Whether sign-ups are behind for how close the event is: most sign-ups come in the last two
 * weeks, so a quiet start is normal; a quiet last week isn't (MLH: 100% of target at T−14 d is
 * healthy, 200% at T−7 d for free events). Thresholds are halved for a gentle nudge, not an alarm.
 */

const DAY = 86_400_000;

/** [days before the start, share of capacity below which it's behind] */
export const PACING_THRESHOLDS: readonly (readonly [number, number])[] = [
  [7, 1],
  [14, 0.5],
];

export function pacing(
  event: { capacity: number | null; startDate: string | Date },
  /** Lugares ocupados (anotados + +1s + offers) */
  seats: number,
  now = Date.now()
): { behind: false } | { behind: true; daysLeft: number; target: number } {
  if (!event.capacity) return { behind: false };
  const daysLeft = Math.ceil((new Date(event.startDate).getTime() - now) / DAY);
  if (daysLeft <= 0) return { behind: false };
  for (const [days, share] of PACING_THRESHOLDS) {
    if (daysLeft <= days) {
      const target = Math.ceil(event.capacity * share);

      return seats < target ? { behind: true, daysLeft, target } : { behind: false };
    }
  }

  return { behind: false };
}
