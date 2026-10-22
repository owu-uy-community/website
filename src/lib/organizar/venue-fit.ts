/**
 * Which spaces suit an event, best first: the hard limits (busy that day, not a hosting weekday,
 * too small, too little notice, its meetups for that month already given) put a space at the
 * bottom with the reason; among the rest, what fits best and who hosted least recently go first,
 * so the same company isn't asked every time. The "Plan B" space always closes the list.
 */
export type SizeBucket = "hasta-30" | "30-60" | "60-120" | "120+";

/** The most people each size means, to compare with a space's capacity */
export const SIZE_PEOPLE: Record<SizeBucket, number> = { "hasta-30": 30, "30-60": 60, "60-120": 120, "120+": 200 };

export const SIZE_LABEL: Record<SizeBucket, string> = {
  "hasta-30": "Hasta 30",
  "30-60": "30 a 60",
  "60-120": "60 a 120",
  "120+": "Más de 120",
};

export type FitVenue = {
  capacity: number | null;
  amenities: string[];
  hostDays: number[];
  leadDays: number;
  monthlyCap: number | null;
  requestable: boolean;
  fallback: boolean;
  hostedUs: number;
  /** When it last hosted anyone, ISO */
  lastHostedAt: string | null;
  /** Of the requests it got, the share it answered (null with none yet) */
  responseRate: number | null;
};

export type Want = { size: SizeBucket | null; needs: string[]; day: string | null };

/** Days the space is taken (accepted requests and events there), "YYYY-MM-DD" */
export type Limits = { busy: string[] };

export type Fit = {
  /** Why it doesn't work for this event, in words; empty when it does */
  blockers: string[];
  /** Needs it doesn't cover */
  missing: string[];
  score: number;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** Months at a space's monthly cap, "YYYY-MM" */
export const fullMonths = (busy: string[], monthlyCap: number | null) => {
  if (!monthlyCap) return [];
  const perMonth = new Map<string, number>();
  for (const day of busy) perMonth.set(day.slice(0, 7), (perMonth.get(day.slice(0, 7)) ?? 0) + 1);

  return [...perMonth].filter(([, count]) => count >= monthlyCap).map(([month]) => month);
};

export function venueFit(venue: FitVenue, want: Want, limits: Limits, now: number): Fit {
  const blockers: string[] = [];
  if (want.day) {
    const weekday = new Date(`${want.day}T12:00:00Z`).getUTCDay();
    if (limits.busy.includes(want.day)) blockers.push("Ocupado ese día");
    else if (venue.hostDays.length > 0 && !venue.hostDays.includes(weekday)) {
      blockers.push(`Recibe los ${venue.hostDays.map((day) => WEEKDAYS[day]).join(", ")}`);
    }
    if (Date.parse(`${want.day}T23:59:00-03:00`) < now + venue.leadDays * DAY_MS) {
      blockers.push(`Pide ${venue.leadDays} días de anticipación`);
    }
    if (fullMonths(limits.busy, venue.monthlyCap).includes(want.day.slice(0, 7))) {
      blockers.push("Ya recibe todo lo que puede ese mes");
    }
  }
  if (want.size && venue.capacity !== null && venue.capacity < SIZE_PEOPLE[want.size]) {
    blockers.push(`Entran ${venue.capacity}`);
  }
  const missing = want.needs.filter((need) => !venue.amenities.includes(need));

  const sinceHosted = venue.lastHostedAt ? (now - Date.parse(venue.lastHostedAt)) / DAY_MS : 365;
  const score =
    (venue.requestable ? 20 : 0) -
    15 * missing.length +
    (venue.hostedUs > 0 ? 10 : 0) +
    Math.min(10, sinceHosted / 30) +
    10 * (venue.responseRate ?? 0.5);

  return { blockers, missing, score };
}

/** Best first: what works before what doesn't, the Plan B space last of all. */
export const rankVenues = <T extends { fallback: boolean; fit: Fit }>(venues: T[]) =>
  venues.toSorted(
    (a, b) =>
      Number(a.fallback) - Number(b.fallback) ||
      Number(a.fit.blockers.length > 0) - Number(b.fit.blockers.length > 0) ||
      b.fit.score - a.fit.score
  );
