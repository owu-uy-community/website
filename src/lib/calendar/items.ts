import { addDays } from "./holidays";
import type { CalendarItem } from "./score";

/** "2026-11" → its first and last day. */
export function monthRange(month: string) {
  const [year, index] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();

  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** The month before or after "2026-11". */
export const shiftMonth = (month: string, by: number) => {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + by, 1));

  return date.toISOString().slice(0, 7);
};

const SAME_MEETUP_MS = 90 * 60_000;

/**
 * Our own events plus the meetup-bot feed, without counting one meetup twice: a feed item from a
 * community that has an OWU event within 90 minutes of it is the same meetup, published on Meetup.
 */
export function mergeItems(own: CalendarItem[], feed: CalendarItem[]) {
  const fromFeed = feed.filter(
    (item) =>
      !own.some(
        (event) =>
          event.kind === "event" &&
          event.communitySlug !== null &&
          event.communitySlug === item.communitySlug &&
          Math.abs(Date.parse(event.start) - Date.parse(item.start)) <= SAME_MEETUP_MS
      )
  );

  return [...own, ...fromFeed].toSorted((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** The days an item touches, for laying it on a month grid. */
export const itemDays = (start: string, end: string | null, dayOf: (iso: string) => string) => {
  const first = dayOf(start);
  const last = end ? dayOf(end) : first;
  const days = [first];
  for (let day = addDays(first, 1); day <= last && days.length < 14; day = addDays(day, 1)) days.push(day);

  return days;
};
