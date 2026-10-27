import "server-only";

import { cache } from "react";

import { getTimeline } from "./data";
import type { TimelineCommunity, TimelineEvent, TimelinePerson, TimelinePersonChip, TimelineTalk } from "./types";

/*
 * The profiles (/timeline/personas): people.json says who they are, the events say what each of
 * them organized and with whom, and the talks they gave.
 */

/** An event's organizers as it names them, each with their profile's photo */
export function organizersOf(event: TimelineEvent): TimelinePersonChip[] {
  const { person } = getTimeline();
  return (event.organizers ?? []).map(({ name, person: slug }) => {
    const photo = person.get(slug)?.photo;
    return { slug, name, ...(photo ? { photo } : {}) };
  });
}

export type GivenTalk = { event: TimelineEvent; talk: TimelineTalk };

/** Each profile's events and talks, oldest first */
const byPerson = cache(() => {
  const events = new Map<string, TimelineEvent[]>();
  const talks = new Map<string, GivenTalk[]>();
  for (const event of getTimeline().events) {
    for (const { person } of event.organizers ?? []) events.set(person, [...(events.get(person) ?? []), event]);
    for (const talk of event.talks ?? [])
      for (const { person } of talk.speakers ?? [])
        if (person) talks.set(person, [...(talks.get(person) ?? []), { event, talk }]);
  }
  return { events, talks };
});

export type PersonPage = {
  person: TimelinePerson;
  events: TimelineEvent[];
  talks: GivenTalk[];
  /** Where they organized or spoke: how many events each */
  communities: { community: TimelineCommunity; events: number }[];
  /** Who they organized with the most */
  partners: { person: TimelinePerson; events: number }[];
};

export function getPersonPage(slug: string): PersonPage | null {
  const { person: people, community } = getTimeline();
  const person = people.get(slug);
  if (!person) return null;
  const events = byPerson().events.get(slug) ?? [];
  const talks = byPerson().talks.get(slug) ?? [];
  const involved = new Set([...events, ...talks.map(({ event }) => event)]);

  const together = new Map<string, number>();
  for (const event of events)
    for (const { person: other } of event.organizers ?? [])
      if (other !== slug) together.set(other, (together.get(other) ?? 0) + 1);

  // The communities they organized for or spoke at, then the ones whose team they're on without an event yet
  const slugs = [...new Set([...person.communities, ...(person.roles ?? []).map((role) => role.community)])];
  return {
    person,
    events,
    talks,
    communities: slugs.flatMap((key) => {
      const found = community.get(key);
      return found
        ? [{ community: found, events: [...involved].filter((event) => event.community === key).length }]
        : [];
    }),
    partners: [...together]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .flatMap(([key, count]) => (people.get(key) ? [{ person: people.get(key)!, events: count }] : [])),
  };
}
