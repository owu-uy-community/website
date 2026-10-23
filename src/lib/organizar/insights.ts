import { dayKey } from "../community/time";

/**
 * A community's numbers that matter (second visits, people coming back), from who came to what.
 * Member counts are vanity; these aren't. Pure and client-safe: the insights service feeds it rows.
 *
 * "Came": checked in at the door when the event used it (one check-in or more), otherwise kept
 * their seat. A first-timer came with no earlier event of the community behind them.
 */

const DAY = 86_400_000;
/** The window for "vuelven" and the second-visit rate */
export const RETURN_WINDOW_DAYS = 182;

export type PastEvent = { id: string; start: Date | string; doorUsed: boolean };
export type Seat = { eventId: string; person: string; checkedIn: boolean };

export type VisitStats = {
  /** Per event: how many came, how many for the first time */
  perEvent: Map<string, { came: number; firstTimers: number }>;
  /** First-timers in the window (the last event aside: they had no chance yet) and how many came again */
  secondVisit: { firstTimers: number; returned: number };
  /** People who came in the window, and how many of them had come before it */
  returning: { people: number; before: number };
};

/** The seats of people who came: checked in when the event used the door, otherwise kept. */
export function attended(events: PastEvent[], seats: Seat[]) {
  const door = new Map(events.map((event) => [event.id, event.doorUsed]));

  return seats.filter((seat) => door.has(seat.eventId) && (!door.get(seat.eventId) || seat.checkedIn));
}

export function visitStats(events: PastEvent[], seats: Seat[], now = Date.now()): VisitStats {
  const ordered = events.toSorted((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const position = new Map(ordered.map((event, index) => [event.id, index]));
  // Each person's events they came to, by position
  const visits = new Map<string, number[]>();
  for (const seat of attended(events, seats)) {
    const index = position.get(seat.eventId)!;
    const list = visits.get(seat.person) ?? [];
    if (!list.includes(index)) list.push(index);
    visits.set(seat.person, list);
  }

  const perEvent = new Map(ordered.map((event) => [event.id, { came: 0, firstTimers: 0 }]));
  const windowStart = now - RETURN_WINDOW_DAYS * DAY;
  const inWindow = (index: number) => new Date(ordered[index].start).getTime() >= windowStart;
  const last = ordered.length - 1;
  const secondVisit = { firstTimers: 0, returned: 0 };
  const returning = { people: 0, before: 0 };

  for (const list of visits.values()) {
    list.sort((a, b) => a - b);
    const [first] = list;
    for (const index of list) {
      const counts = perEvent.get(ordered[index].id)!;
      counts.came += 1;
      if (index === first) counts.firstTimers += 1;
    }
    if (inWindow(first) && first !== last) {
      secondVisit.firstTimers += 1;
      if (list.length > 1) secondVisit.returned += 1;
    }
    const recent = list.filter(inWindow);
    if (recent.length > 0) {
      returning.people += 1;
      if (list[0] < recent[0] || recent.length > 1) returning.before += 1;
    }
  }

  return { perEvent, secondVisit, returning };
}

/** "Ana  Pérez" and "ana perez" are the same speaker. */
const speakerKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Who gave talks since `since`, and how many of them for the first time in the community. */
export function speakerStats(events: { start: Date | string; speakers: string[] }[], since: number) {
  const firstSeen = new Map<string, number>();
  const recent = new Set<string>();
  for (const event of events.toSorted((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())) {
    const at = new Date(event.start).getTime();
    for (const name of event.speakers) {
      const key = speakerKey(name);
      if (!key) continue;
      if (!firstSeen.has(key)) firstSeen.set(key, at);
      if (at >= since) recent.add(key);
    }
  }
  const fresh = [...recent].filter((key) => (firstSeen.get(key) ?? 0) >= since).length;

  return { speakers: recent.size, new: fresh, repeat: recent.size - fresh };
}

/** "T4 2026": the calendar quarter a moment falls in, in Montevideo. */
export const quarterOf = (date: Date | string) => {
  const [year, month] = dayKey(date).split("-").map(Number);

  return `T${Math.floor((month - 1) / 3) + 1} ${year}`;
};

/** The last `count` quarters, oldest first, ending with the current one. */
export function lastQuarters(count: number, now = Date.now()) {
  const [year, month] = dayKey(new Date(now)).split("-").map(Number);
  const current = year * 4 + Math.floor((month - 1) / 3);

  return Array.from({ length: count }, (_, index) => {
    const quarter = current - (count - 1 - index);

    return `T${(quarter % 4) + 1} ${Math.floor(quarter / 4)}`;
  });
}

/** NPS from 0–10 answers: promoters (9–10) minus detractors (0–6), as a whole number. Null without answers. */
export function npsOf(values: number[]) {
  if (values.length === 0) return null;
  const promoters = values.filter((value) => value >= 9).length;
  const detractors = values.filter((value) => value <= 6).length;

  return Math.round(((promoters - detractors) / values.length) * 100);
}
