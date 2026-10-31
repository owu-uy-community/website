import "server-only";

import { cache } from "react";

import { topicLabel } from "lib/community/topics";

import { getTimeline, isCommunityEvent } from "./data";
import type { TimelineCommunity, TimelineEvent } from "./types";
import { venueHref } from "./map";
import { getVenues, plain, venueKey } from "./venues";

/*
 * The "En números" section of /timeline: small aggregates over the dataset, computed on the server
 * so the page only ships the totals. Counts are in-person events organized by communities (the
 * default view of the archive): online ones and the ecosystem layer would blur "when and where
 * people met".
 */

export type Rank = { name: string; count: number; href?: string };

export type TimelineStats = {
  from: number;
  to: number;
  /** Events per month (index 0 = January), one row per year */
  heatmap: { year: number; months: number[] }[];
  /** Weekday counts, Monday first; only events with a start time */
  weekdays: number[];
  /** Start-hour counts from 8 to 22 */
  hours: { hour: number; count: number }[];
  timed: number;
  /** Events per year by the organizing community's main topic: the busiest six and "otros" */
  topics: { keys: string[]; labels: Record<string, string>; rows: ({ year: number } & Record<string, number>)[] };
  /** Communities that met in person each year, the ones that held their first event, and the ones that held their last */
  communities: { year: number; active: number; births: number; closures: number }[];
  venues: Rank[];
  /** By department; events abroad or without a city left out */
  places: Rank[];
  /** Median RSVPs per meetup, for years with at least five meetups with RSVPs */
  attendance: { year: number; median: number; meetups: number }[];
  biggest: { slug: string; title: string; start: string; community: string; people: number }[];
  /** The biggest communities today: members of their Meetup group */
  sizes: Rank[];
  /** What the people who went rated their events on Meetup, averaged over every rating */
  rating: { average: number; ratings: number } | null;
};

const DEPARTMENTS: [RegExp, string][] = [
  [/montevideo|buceo|carrasco|pocitos|cordon|malvin/, "Montevideo"],
  [/salto/, "Salto"],
  [/maldonado|punta del este|san carlos|piriapolis/, "Maldonado"],
  [/canelones|solymar|el pinar|atlantida|ciudad de la costa|las piedras|pando/, "Canelones"],
  [/paysandu|guichon/, "Paysandú"],
  [/florida/, "Florida"],
  [/colonia|carmelo/, "Colonia"],
  [/fray bentos|rio negro/, "Río Negro"],
  [/durazno/, "Durazno"],
  [/rivera/, "Rivera"],
  [/tacuarembo/, "Tacuarembó"],
  [/rocha/, "Rocha"],
  [/melo|cerro largo/, "Cerro Largo"],
  [/minas|lavalleja/, "Lavalleja"],
  [/mercedes|soriano/, "Soriano"],
  [/artigas/, "Artigas"],
  [/san jose/, "San José"],
];
const departmentOf = (city: string) => DEPARTMENTS.find(([pattern]) => pattern.test(plain(city)))?.[1] ?? null;

const yearOf = (event: TimelineEvent) => Number(event.start.slice(0, 4));

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const ranked = (counts: Map<string, number>, limit: number): Rank[] =>
  [...counts]
    .map(([name, count]) => ({ name, count }))
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);

const bump = <K>(counts: Map<K, number>, key: K) => counts.set(key, (counts.get(key) ?? 0) + 1);

export function computeStats(events: TimelineEvent[], communities: TimelineCommunity[]): TimelineStats {
  const own = events.filter((event) => isCommunityEvent(event) && !event.online);
  const from = Math.min(...own.map(yearOf));
  const to = Math.max(...own.map(yearOf));
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const community = new Map(communities.map((c) => [c.slug, c]));

  // When: the date says the month; the time (when there is one) says weekday and hour, in Montevideo time
  const heatmap = years.map((year) => ({ year, months: Array.from({ length: 12 }, () => 0) }));
  const weekdays = Array.from({ length: 7 }, () => 0);
  const hours = new Map<number, number>();
  let timed = 0;
  for (const event of own) {
    const month = Number(event.start.slice(5, 7));
    if (month) heatmap[yearOf(event) - from].months[month - 1]++;
    if (event.start.length <= 10) continue;
    timed++;
    const [y, m, d] = event.start.slice(0, 10).split("-").map(Number);
    weekdays[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]++;
    bump(hours, Number(event.start.slice(11, 13)));
  }

  // Topics: the six busiest, the rest folded into "otros"
  const topicOf = (event: TimelineEvent) => community.get(event.community)?.topics[0] ?? "general";
  const totals = new Map<string, number>();
  for (const event of own) bump(totals, topicOf(event));
  const keys = [...totals].toSorted((a, b) => b[1] - a[1]).map(([key]) => key);
  const shown = keys.slice(0, 6);
  const folded = keys.length > 6;
  const topicRows = years.map((year) => {
    const row: { year: number } & Record<string, number> = { year };
    for (const key of [...shown, ...(folded ? ["otros"] : [])]) row[key] = 0;
    return row;
  });
  for (const event of own) {
    const key = shown.includes(topicOf(event)) ? topicOf(event) : "otros";
    topicRows[yearOf(event) - from][key]++;
  }

  // Communities: met in person that year; held their first, or (for the ones that stopped) their last event
  const active = years.map(() => new Set<string>());
  for (const event of own) active[yearOf(event) - from].add(event.community);
  const lanes = communities.filter((c) => c.layer === "community" && c.slug !== "hitos" && (c.events ?? 0) > 0);
  const communityRows = years.map((year, i) => ({
    year,
    active: active[i].size,
    births: lanes.filter((c) => Number(c.first?.slice(0, 4)) === year).length,
    closures: lanes.filter((c) => c.status === "cerrada" && Number(c.last?.slice(0, 4)) === year).length,
  }));

  // Where
  const venues = new Map<string, number>();
  const venueNames = new Map<string, Map<string, number>>();
  const places = new Map<string, number>();
  for (const event of own) {
    const venue = event.venue ? venueKey(event.venue) : null;
    if (venue) {
      bump(venues, venue.key);
      const names = venueNames.get(venue.key) ?? new Map<string, number>();
      bump(names, venue.display);
      venueNames.set(venue.key, names);
    }
    const department = event.city ? departmentOf(event.city) : null;
    if (department) bump(places, department);
  }
  // Each place under the spelling most of its events used
  const topVenues = ranked(venues, 12).map(({ name, count }) => ({
    name: ranked(venueNames.get(name)!, 1)[0].name,
    count,
  }));

  // Attendance: RSVPs are sign-ups on Meetup, not head counts; the median keeps one big night from skewing a year
  const rsvpsByYear = new Map<number, number[]>();
  for (const event of own) {
    if (event.kind !== "meetup" || !event.rsvps) continue;
    rsvpsByYear.set(yearOf(event), [...(rsvpsByYear.get(yearOf(event)) ?? []), event.rsvps]);
  }
  const attendance = years.flatMap((year) => {
    const values = rsvpsByYear.get(year) ?? [];
    return values.length >= 5 ? [{ year, median: median(values), meetups: values.length }] : [];
  });

  const biggest = own
    .filter((event) => event.rsvps)
    .toSorted((a, b) => b.rsvps! - a.rsvps! || a.start.localeCompare(b.start))
    .slice(0, 10)
    .map((event) => ({
      slug: event.slug,
      title: event.title,
      start: event.start,
      community: community.get(event.community)?.name ?? event.community,
      people: event.rsvps!,
    }));

  // Today: each community's Meetup group, its members and how its events were rated
  const onMeetup = communities.filter((c) => c.layer === "community" && c.members);
  const sizes = onMeetup
    .toSorted((a, b) => b.members! - a.members!)
    .slice(0, 12)
    .map((c) => ({ name: c.name, count: c.members!, href: `/timeline?comunidad=${c.slug}#archivo` }));
  const rated = onMeetup.filter((c) => c.rating && c.ratings);
  const ratings = rated.reduce((sum, c) => sum + c.ratings!, 0);

  return {
    from,
    to,
    heatmap,
    weekdays,
    hours: Array.from({ length: 15 }, (_, i) => ({ hour: i + 8, count: hours.get(i + 8) ?? 0 })),
    timed,
    topics: {
      keys: [...shown, ...(folded ? ["otros"] : [])],
      labels: Object.fromEntries([...shown.map((key) => [key, topicLabel(key)]), ["otros", "Otros temas"]]),
      rows: topicRows,
    },
    communities: communityRows,
    venues: topVenues,
    places: ranked(places, 12),
    attendance,
    biggest,
    sizes,
    rating: ratings ? { average: rated.reduce((sum, c) => sum + c.rating! * c.ratings!, 0) / ratings, ratings } : null,
  };
}

export const getTimelineStats = cache(() => {
  const { events, communities } = getTimeline();
  const stats = computeStats(events, communities);
  // Each place links to its page
  const { byKey } = getVenues();
  for (const venue of stats.venues) {
    const page = byKey.get(venueKey(venue.name)?.key ?? "");
    if (page) venue.href = venueHref(page.slug);
  }
  return stats;
});
