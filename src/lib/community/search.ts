import "server-only";

import { cache } from "react";

import { TALK_EVENTS } from "keystatic/collections/talks";

import { getCommunities, getTalks } from "./content";
import { getUpcomingEvents } from "./events";
import { PUBLIC_ROUTES } from "./site";
import { dateParts } from "./time";
import { topicLabel } from "./topics";

export type SearchItem = {
  group: "Páginas" | "Comunidades" | "Próximos eventos" | "Charlas";
  label: string;
  hint?: string;
  href: string;
  keywords?: string;
};

const eventLabel = new Map<string, string>(TALK_EVENTS.map(({ value, label }) => [value, label]));

/** Everything the ⌘K palette can jump to, built once per render */
export const getSearchIndex = cache(async (): Promise<SearchItem[]> => {
  const [communities, events, talks] = await Promise.all([getCommunities(), getUpcomingEvents(), getTalks()]);

  return [
    ...PUBLIC_ROUTES.map((page): SearchItem => ({
      group: "Páginas",
      label: page.label,
      hint: "description" in page ? page.description : undefined,
      href: page.href,
    })),
    ...communities.map((community): SearchItem => ({
      group: "Comunidades",
      label: community.name,
      hint: community.description,
      href: `/comunidad/${community.slug}`,
      keywords: community.topics.map(topicLabel).join(" "),
    })),
    ...events.slice(0, 12).map((event): SearchItem => {
      const when = dateParts(event.start);

      return {
        group: "Próximos eventos",
        label: event.title,
        hint: `${when.weekday} ${when.day} ${when.month} · ${event.group}`,
        href: event.url,
        keywords: event.group,
      };
    }),
    ...talks.map((talk): SearchItem => ({
      group: "Charlas",
      label: talk.title,
      hint: `${talk.speakers.join(", ")} · ${eventLabel.get(talk.event) ?? ""}`,
      href: `/charlas#${talk.slug}`,
      keywords: talk.topics.map(topicLabel).join(" "),
    })),
  ];
});
