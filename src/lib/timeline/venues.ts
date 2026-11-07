import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { cache } from "react";

import { getTimeline, isCommunityEvent } from "./data";
import { type MapDot, type MapView, project } from "./map";
import type { TimelineEvent } from "./types";

/*
 * The places the community met in (/timeline/lugares): every event's venue as people typed it,
 * joined into one place per name, with where it is on the map when Meetup says. A place counts the
 * in-person events communities ran there, like every other number of the history ("¿Dónde?" ranks
 * these same counts); what companies, academia and the State held there is listed apart.
 */

const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");
export const plain = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(/\s+/g, " ").trim();

/** The same place under the names people typed: [pattern on the plain name, display name] */
const VENUE_ALIASES: [RegExp, string][] = [
  [/^torre (antel|de las telecomunicaciones)/, "Torre de las Telecomunicaciones"],
  [/^case uy/, "CASE UY"],
  [/^co-?work (uy|uruguay)/, "Co-Work Uruguay"],
  [/^coworkingmvd/, "CoworkingMVD"],
  [/^sinergia/, "Sinergia"],
  [/^rootstrap/, "Rootstrap"],
  [/^qubika/, "Qubika"],
  [/^(universidad ort|ort uruguay)/, "Universidad ORT"],
  [/^(facultad de ingenieria|fing)\b/, "Facultad de Ingeniería (UdelaR)"],
  [/^(universidad catolica|ucu)\b/, "Universidad Católica"],
];
const NOT_A_PLACE = /^(online|virtual|zoom|tbd|a confirmar|a definir|meetup)$/;

/** "Oficina de Pyxis" and "Pyxis (via Cubox)" are Pyxis */
export function venueKey(venue: string) {
  const name = plain(venue)
    .replace(/^oficinas? de /, "")
    .replace(/\s*\(via [^)]*\)$/, "");
  if (!name || NOT_A_PLACE.test(name)) return null;
  const alias = VENUE_ALIASES.find(([pattern]) => pattern.test(name));
  return alias
    ? { key: alias[1], display: alias[1] }
    : { key: name, display: venue.replace(/^Oficinas? de /i, "").replace(/\s*\(via [^)]*\)$/i, "") };
}

export type TimelineVenue = {
  slug: string;
  name: string;
  city?: string;
  /** [lat, lon]: the middle of where its events were pinned */
  geo?: [number, number];
  /** The communities' events, oldest first: the ones the place counts */
  events: TimelineEvent[];
  /** The ecosystem's events there (companies, academia, the State), oldest first, apart */
  others: TimelineEvent[];
  /** Community slugs, most events first */
  communities: string[];
};

const mostUsed = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0];
};
const median = (values: number[]) => values.toSorted((a, b) => a - b)[values.length >> 1];

/**
 * Places where communities held two events or more (one is often a one-off, or someone's home),
 * busiest first, then by name
 */
export const getVenues = cache(() => {
  const grouped = new Map<string, { names: string[]; events: TimelineEvent[]; others: TimelineEvent[] }>();
  for (const event of getTimeline().events) {
    if (event.online || !event.venue || event.kind === "hito") continue;
    const venue = venueKey(event.venue);
    if (!venue) continue;
    const entry = grouped.get(venue.key) ?? { names: [], events: [], others: [] };
    if (isCommunityEvent(event)) {
      entry.names.push(venue.display);
      entry.events.push(event);
    } else entry.others.push(event);
    grouped.set(venue.key, entry);
  }

  const venues: TimelineVenue[] = [];
  const pages = new Map<string, TimelineVenue>();
  const taken = new Set<string>();
  const ordered = [...grouped]
    .filter(([, { events }]) => events.length >= 2)
    .map(([key, entry]) => ({ key, ...entry, name: mostUsed(entry.names)! }))
    .toSorted((a, b) => b.events.length - a.events.length || a.name.localeCompare(b.name, "es"));
  for (const { key, name, events, others } of ordered) {
    const base =
      plain(key)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "lugar";
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    // Where the communities' events were pinned; the ecosystem's when none were
    const pinsOf = (list: TimelineEvent[]) => list.flatMap((event) => (event.geo ? [event.geo] : []));
    const pinned = pinsOf(events).length ? pinsOf(events) : pinsOf(others);
    const counts = new Map<string, number>();
    for (const event of events) counts.set(event.community, (counts.get(event.community) ?? 0) + 1);
    const venue: TimelineVenue = {
      slug,
      name,
      city: mostUsed([...events, ...others].flatMap((event) => (event.city ? [event.city] : []))),
      // The median, so one event pinned across town doesn't move the place
      geo: pinned.length ? [median(pinned.map(([lat]) => lat)), median(pinned.map(([, lon]) => lon))] : undefined,
      events,
      others,
      communities: [...counts].toSorted((a, b) => b[1] - a[1]).map(([community]) => community),
    };
    venues.push(venue);
    pages.set(key, venue);
  }

  const ofEvent = new Map<string, string>();
  for (const venue of venues)
    for (const event of [...venue.events, ...venue.others]) ofEvent.set(event.slug, venue.slug);
  return { venues, bySlug: new Map(venues.map((venue) => [venue.slug, venue])), byKey: pages, ofEvent };
});

/** The maps (content/timeline/map.json, drawn by scripts/timeline/map.ts) */
export const getMaps = cache(
  () =>
    JSON.parse(readFileSync(path.join(process.cwd(), "content/timeline/map.json"), "utf8")) as {
      uruguay: MapView;
      montevideo: MapView;
    }
);

/** The places on a map, the ones inside its view */
export const dotsOn = (view: MapView, venues: TimelineVenue[]): MapDot[] =>
  venues.flatMap((venue) => {
    const point = venue.geo && project(view, venue.geo);
    return point ? [{ slug: venue.slug, name: venue.name, count: venue.events.length, x: point[0], y: point[1] }] : [];
  });
