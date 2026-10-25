import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cache } from "react";

import type { LifelineEventSegment, LifelineMarker } from "components/lifeline/types";
import { PHOTOS } from "components/community/home/photos";

import { photoSources, thumbSources } from "./image";
import type { TimelineCommunity, TimelineEvent, TimelineKind, TimelinePhoto } from "./types";

/*
 * The /timeline dataset: content/timeline/events/<year>.json and communities.json (written by
 * scripts/timeline/build.ts), plus story.json (the curated year-by-year copy). The content folder
 * ships with every function (outputFileTracingIncludes), so this reads it from disk.
 */

const DIR = path.join(process.cwd(), "content/timeline");
const read = <T>(file: string) => JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as T;

/** OWU's own photos of La Meetup (the home's photo wall) belong to those editions */
const OWN_PHOTOS: Record<string, "ii" | "iii"> = {
  "2024-10-19-la-meetup-2024": "ii",
  "2025-11-01-la-meetup-2025": "iii",
};

export const getTimeline = cache(() => {
  const events = readdirSync(path.join(DIR, "events"))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .flatMap((file) => read<TimelineEvent[]>(`events/${file}`));

  for (const event of events) {
    const edition = OWN_PHOTOS[event.slug];
    if (!edition) continue;
    const own: TimelinePhoto[] = PHOTOS.filter((photo) => photo.event === edition).map((photo) => ({
      src: photo.src,
      alt: photo.alt,
      by: "OWU",
      source: "OWU",
    }));
    event.photos = [...own, ...(event.photos ?? [])];
  }

  const communities = read<TimelineCommunity[]>("communities.json");

  return {
    events,
    communities,
    community: new Map(communities.map((community) => [community.slug, community])),
    bySlug: new Map(events.map((event) => [event.slug, event])),
  };
});

/** What counts by default: community-run, and not a milestone */
export const isCommunityEvent = (event: TimelineEvent) => event.layer === "community" && event.kind !== "hito";

export const photoCount = (event: TimelineEvent) => Math.max(event.photos?.length ?? 0, event.photoCount ?? 0);

export function getStats() {
  const { events, communities } = getTimeline();
  const own = events.filter(isCommunityEvent);
  const first = own[0]?.start.slice(0, 4) ?? "2007";

  return {
    events: own.length,
    communities: communities.filter((community) => community.layer === "community" && (community.events ?? 0) > 0)
      .length,
    photos: events.reduce((sum, event) => sum + photoCount(event), 0),
    rsvps: own.reduce((sum, event) => sum + (event.rsvps ?? 0), 0),
    since: Number(first),
  };
}

/** One row of the archive: short keys, since every event ships to the client filters */
export type ArchiveRow = {
  /** slug */
  s: string;
  /** title */
  t: string;
  /** start, end */
  d: string;
  e?: string;
  k: TimelineKind;
  /** ecosystem layer */
  x?: 1;
  /** online */
  o?: 1;
  /** community slug */
  c: string;
  /** venue · city */
  v?: string;
  /** city alone, for the city filter */
  y?: string;
  r?: number;
  /** cover photo, as published (the client asks for a thumbnail size) */
  i?: string;
  /** photo count */
  n?: number;
  /** first milestone that happened there */
  h?: string;
};

export function getArchiveRows(): ArchiveRow[] {
  return getTimeline().events.map((event) => {
    const cover = event.photos?.[0];
    const n = photoCount(event);
    const venue = [event.venue, event.city && event.city !== event.venue ? event.city : null]
      .filter(Boolean)
      .join(" · ");

    return {
      s: event.slug,
      t: event.title,
      d: event.start,
      ...(event.end ? { e: event.end } : {}),
      k: event.kind,
      ...(event.layer === "ecosystem" ? { x: 1 as const } : {}),
      ...(event.online ? { o: 1 as const } : {}),
      c: event.community,
      ...(venue ? { v: venue } : {}),
      ...(event.city && !event.online ? { y: event.city } : {}),
      ...(event.rsvps ? { r: event.rsvps } : {}),
      ...(cover ? { i: cover.src } : {}),
      ...(n ? { n } : {}),
      ...(event.highlights?.length ? { h: event.highlights[0] } : {}),
    };
  });
}

type StoryYear = {
  year: number;
  label?: string;
  /** Each line: text, or [text, event slug] for a link */
  lines: (string | [string, string])[][];
  photos?: { event: string; n: number }[];
  /** Community slugs whose logo shows on the year */
  badges?: string[];
};

const eventCount = new Intl.NumberFormat("es-UY");

/** Roughly how tall a year's text runs below the rail (14px over 18rem, ~38 characters a line) */
const textHeight = (entry: StoryYear) =>
  24 +
  (entry.badges?.length ? 36 : 0) +
  entry.lines.reduce((sum, line) => {
    const text = line.map((segment) => (typeof segment === "string" ? segment : segment[0])).join("");
    return sum + Math.ceil(text.length / 38) * 22;
  }, 0) +
  (entry.lines.length - 1) * 16;

/** The story rail: content/timeline/story.json resolved to Lifeline markers */
export const getStory = cache((): LifelineMarker[] => {
  const { bySlug, community, events } = getTimeline();
  const perYear = new Map<number, number>();
  for (const event of events) {
    if (!isCommunityEvent(event) || event.online) continue;
    const year = Number(event.start.slice(0, 4));
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
  }

  return read<StoryYear[]>("story.json").map((entry) => {
    const count = perYear.get(entry.year) ?? 0;

    const below = textHeight(entry) + 28;

    return {
      id: `y${entry.year}`,
      year: entry.year,
      label: entry.label,
      age: entry.label
        ? "1990–2006"
        : count
          ? `${eventCount.format(count)} ${count === 1 ? "evento" : "eventos"}`
          : "—",
      events: entry.lines.map((line) =>
        line.map((segment): LifelineEventSegment =>
          typeof segment === "string"
            ? { type: "text", value: segment }
            : { type: "link", value: segment[0], href: `/timeline/${segment[1]}` }
        )
      ),
      // Under the year's text, a second one tucked lower and to the right, like loose prints
      photos: (entry.photos ?? []).flatMap(({ event: slug, n }, i) => {
        const event = bySlug.get(slug);
        const photo = event?.photos?.[n];
        if (!event || !photo) return [];
        return [
          {
            // Cards are 190px wide (160px in the phone layout)
            ...photoSources(photo.src, "(max-width: 767px) 160px, 190px"),
            alt: photo.alt ?? event.title,
            width: 190,
            x: i ? 0.38 : 0.02,
            y: below + i * 64,
            rotate: i ? 3.5 : -2.5,
          },
        ];
      }),
      badges: (entry.badges ?? []).flatMap((slug) => {
        // Logo tiles are up to 1024px; the badge shows them at 24px (asked at 48 for 2x screens)
        const logo = community.get(slug)?.logo;
        return logo ? [{ src: thumbSources(logo, 48).src, alt: community.get(slug)!.name }] : [];
      }),
    };
  });
});
