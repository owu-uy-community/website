import "server-only";

import { cache } from "react";

import { getTimeline } from "./data";
import type { TimelineCommunity, TimelineEvent, TimelinePerson, TimelinePersonChip } from "./types";

/*
 * The organizers' profiles (/timeline/organizadores): people.json says who they are, the events
 * say what each of them organized and with whom.
 */

/** An event's organizers as it names them, each with their profile's photo */
export function organizersOf(event: TimelineEvent): TimelinePersonChip[] {
  const { person } = getTimeline();
  return (event.organizers ?? []).map(({ name, person: slug }) => {
    const photo = person.get(slug)?.photo;
    return { slug, name, ...(photo ? { photo } : {}) };
  });
}

/** Each profile's events, oldest first */
const eventsByPerson = cache(() => {
  const byPerson = new Map<string, TimelineEvent[]>();
  for (const event of getTimeline().events)
    for (const { person } of event.organizers ?? []) byPerson.set(person, [...(byPerson.get(person) ?? []), event]);
  return byPerson;
});

export type PersonPage = {
  person: TimelinePerson;
  events: TimelineEvent[];
  communities: { community: TimelineCommunity; events: number }[];
  /** Who they organized with the most */
  partners: { person: TimelinePerson; events: number }[];
};

export function getPersonPage(slug: string): PersonPage | null {
  const { person: people, community } = getTimeline();
  const person = people.get(slug);
  if (!person) return null;
  const events = eventsByPerson().get(slug) ?? [];

  const together = new Map<string, number>();
  for (const event of events)
    for (const { person: other } of event.organizers ?? [])
      if (other !== slug) together.set(other, (together.get(other) ?? 0) + 1);

  // The communities they organized for, then the ones whose team they're on without an event yet
  const slugs = [...new Set([...person.communities, ...(person.roles ?? []).map((role) => role.community)])];
  return {
    person,
    events,
    communities: slugs.flatMap((key) => {
      const found = community.get(key);
      return found ? [{ community: found, events: events.filter((event) => event.community === key).length }] : [];
    }),
    partners: [...together]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .flatMap(([key, count]) => (people.get(key) ? [{ person: people.get(key)!, events: count }] : [])),
  };
}
