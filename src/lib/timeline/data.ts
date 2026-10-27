import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cache } from "react";

import type { LifelineEventSegment, LifelineMarker } from "components/lifeline/types";
import { PHOTOS } from "components/community/home/photos";

import { photoCredit } from "./format";
import { photoSources, thumbSources } from "./image";
import type { TimelineCommunity, TimelineEvent, TimelineKind, TimelinePerson, TimelinePhoto } from "./types";

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
  // Who organized what, most events first
  const people = read<TimelinePerson[]>("people.json");

  return {
    events,
    communities,
    community: new Map(communities.map((community) => [community.slug, community])),
    bySlug: new Map(events.map((event) => [event.slug, event])),
    people,
    person: new Map(people.map((person) => [person.slug, person])),
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
  /*
   * What the reading panel needs to hold the exact shape of an event while it loads: how many
   * photos it has (as files), its description's length, how many talks, its organizers' line
   * length, the attendance when there's no RSVP count, and a date's confidence when it isn't firm
   */
  p?: number;
  l?: number;
  /** Its first real photo (not a flyer, a banner or a logo), for the deck that only shows those */
  f?: string;
  tk?: number;
  g?: number;
  a?: string;
  q?: TimelineEvent["confidence"];
};

/** An event's first real photo, one not served by the Wayback Machine if it has any (those load slowly, or not) */
export const firstPhoto = (event: TimelineEvent) => {
  const real = (event.photos ?? []).filter((photo) => !photo.banner);
  return (real.find((photo) => !photo.src.includes("web.archive.org")) ?? real[0])?.src;
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
      ...(event.photos?.length ? { p: event.photos.length } : {}),
      ...(firstPhoto(event) ? { f: firstPhoto(event) } : {}),
      ...((event.summary ?? event.description) ? { l: (event.summary ?? event.description)!.length } : {}),
      ...(event.talks?.length ? { tk: event.talks.length } : {}),
      ...(event.organizers?.length ? { g: event.organizers.map((organizer) => organizer.name).join(", ").length } : {}),
      ...(event.attendance && !event.rsvps ? { a: event.attendance } : {}),
      ...(event.confidence ? { q: event.confidence } : {}),
    };
  });
}

/** A community as the archive lists it, its event count taken from the rows (milestones included) */
export type ArchiveCommunity = Pick<TimelineCommunity, "slug" | "name" | "status" | "layer" | "first"> & {
  events: number;
  /** Its first topic, for the topic filter */
  topic: string;
  logo?: string;
  /** Photo count, when it has any */
  photos?: number;
};

/** The archive's data (/timeline/archivo.json), also what the server draws the communities grid from */
export const getArchive = cache(() => {
  const rows = getArchiveRows();
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.c, (counts.get(row.c) ?? 0) + 1);
  const communities: ArchiveCommunity[] = getTimeline()
    .communities.filter((community) => counts.has(community.slug))
    .map(({ slug, name, status, layer, first, topics, logo, photos }) => ({
      slug,
      name,
      events: counts.get(slug)!,
      status,
      layer,
      first,
      topic: topics[0] ?? "general",
      ...(logo ? { logo } : {}),
      ...(photos ? { photos } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { rows, communities };
});

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
            credit: photoCredit(photo),
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
