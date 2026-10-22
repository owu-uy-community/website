import "server-only";

import { cache } from "react";
import * as z from "zod";

import { and, eq, gt, inArray } from "drizzle-orm";

import { EXTERNAL_SERVICES } from "app/lib/constants";
import { db } from "lib/db";
import { communities, events, venues } from "lib/db/schema";
import { LEGACY_COMMUNITY_SLUG } from "lib/tenant";

import { getCommunities, getManualEvents, type Community, type ManualEvent } from "./content";
import { OWU_FEED_NAMES } from "./site";
import { montevideoIso } from "./time";

export type CommunityEvent = {
  id: string;
  title: string;
  /** Who organizes it, as people know the group */
  group: string;
  /** Directory entry, when the group is in it */
  communitySlug: string | null;
  /** ISO 8601 with the Montevideo offset */
  start: string;
  end: string | null;
  /** Null means online */
  venue: string | null;
  url: string;
  /** The meetup-bot feed, the hand-curated list, or an event made in OWU (internal link) */
  source: "meetup" | "manual" | "owu";
  /** Organized by OWU itself (CONF, La Meetup) */
  isOwu: boolean;
  /** Made in OWU and called off: the calendar feeds keep it (so subscribed calendars drop it), the agenda doesn't */
  cancelled?: boolean;
};

/** Links we render as hrefs: web pages only, never javascript: or data: */
const WebUrl = z.url({ protocol: /^https?$/ });
const WallClock = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/);

const FeedMeetupSchema = z.object({
  id: z.number(),
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  datetime: WallClock,
  end_datetime: WallClock.nullish(),
  event_url: WebUrl,
  venue: z.string().max(200).nullish(),
});

type FeedMeetup = z.infer<typeof FeedMeetupSchema>;

async function fetchFeed(): Promise<FeedMeetup[]> {
  try {
    const response = await fetch(EXTERNAL_SERVICES.meetupBot, { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const body = (await response.json()) as { meetups?: unknown };
    if (!Array.isArray(body.meetups)) return [];

    // A malformed entry is dropped, not allowed to break the page or smuggle in a link
    return body.meetups.flatMap((entry) => {
      const parsed = FeedMeetupSchema.safeParse(entry);

      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    // The feed is a community-run bot: the pages render without it rather than fail
    return [];
  }
}

const OWU_NAMES = new Set(OWU_FEED_NAMES.map((name) => name.toLowerCase()));
/** Only listed names get the "Organiza OWU" badge: anyone can name a Meetup group "OWU …" */
const isOwuName = (value: string) => OWU_NAMES.has(value.trim().toLowerCase());

/** A published (or called off) event made in Organizá, as the agenda needs it */
export type OwnEvent = {
  id: string;
  name: string;
  slug: string;
  start: string;
  end: string;
  communitySlug: string;
  communityName: string;
  place: string | null;
  /** Its copy on Meetup, if the organizers pasted it back */
  meetupUrl: string | null;
  cancelled?: boolean;
};

const SAME_MEETUP_MS = 90 * 60_000;
/** Compare links by host and path: tracking params and a trailing slash don't make another event */
const sameLink = (a: string, b: string) => {
  const key = (value: string) => {
    try {
      const url = new URL(value);
      return `${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
    } catch {
      return value;
    }
  };

  return key(a) === key(b);
};

async function fetchOwnEvents(): Promise<OwnEvent[]> {
  try {
    const rows = await db
      .select({
        id: events.id,
        name: events.name,
        slug: events.slug,
        startDate: events.startDate,
        endDate: events.endDate,
        status: events.status,
        mode: events.mode,
        placeName: events.placeName,
        externalLinks: events.externalLinks,
        communitySlug: communities.slug,
        communityName: communities.name,
        venueName: venues.name,
      })
      .from(events)
      .innerJoin(communities, eq(communities.id, events.communityId))
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(
          inArray(events.status, ["published", "cancelled"]),
          eq(events.isActive, true),
          eq(communities.isActive, true),
          gt(events.endDate, new Date())
        )
      );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      start: row.startDate.toISOString(),
      end: row.endDate.toISOString(),
      communitySlug: row.communitySlug,
      communityName: row.communityName,
      place: row.mode === "online" ? null : (row.venueName ?? row.placeName),
      meetupUrl: row.externalLinks.meetup ?? null,
      cancelled: row.status === "cancelled",
    }));
  } catch {
    // The agenda renders from the feed alone rather than fail
    return [];
  }
}

export function mergeEvents(feed: FeedMeetup[], manual: ManualEvent[], communities: Community[], own: OwnEvent[] = []) {
  const byFeedName = new Map<string, Community>();
  for (const community of communities) {
    for (const name of [community.name, ...community.feedNames]) byFeedName.set(name.trim().toLowerCase(), community);
  }
  const bySlug = new Map(communities.map((community) => [community.slug, community]));

  // A meetup made in OWU and copied to Meetup shows once, as OWU's. Only a community's own events
  // can hide its feed entries: another community pasting the link must not make them disappear.
  // A cancelled one hides nothing: what's still on Meetup is live there.
  const copied = (meetup: FeedMeetup, communitySlug: string | null) =>
    communitySlug !== null &&
    own.some(
      (event) =>
        !event.cancelled &&
        event.communitySlug === communitySlug &&
        ((event.meetupUrl !== null && sameLink(event.meetupUrl, meetup.event_url)) ||
          Math.abs(Date.parse(event.start) - Date.parse(montevideoIso(meetup.datetime))) <= SAME_MEETUP_MS)
    );

  const fromFeed = feed.flatMap((meetup): CommunityEvent[] => {
    const community = byFeedName.get(meetup.name.trim().toLowerCase()) ?? null;
    if (copied(meetup, community?.slug ?? null)) return [];

    return [
      {
        id: `meetup-${meetup.id}`,
        title: meetup.title,
        group: community?.name ?? meetup.name,
        communitySlug: community?.slug ?? null,
        start: montevideoIso(meetup.datetime),
        end: meetup.end_datetime ? montevideoIso(meetup.end_datetime) : null,
        venue: meetup.venue?.trim() || null,
        url: meetup.event_url,
        source: "meetup",
        isOwu: isOwuName(meetup.name),
      },
    ];
  });

  const fromOwn = own.map((event): CommunityEvent => ({
    id: `owu-${event.id}`,
    title: event.name,
    group: event.communityName,
    communitySlug: event.communitySlug,
    start: event.start,
    end: event.end,
    venue: event.place,
    url: `/comunidad/${event.communitySlug}/events/${event.slug}`,
    source: "owu",
    isOwu: event.communitySlug === LEGACY_COMMUNITY_SLUG,
    ...(event.cancelled ? { cancelled: true } : {}),
  }));

  const fromManual = manual.flatMap((event): CommunityEvent[] => {
    if (!WebUrl.safeParse(event.url).success) return [];
    const community = event.communitySlug ? (bySlug.get(event.communitySlug) ?? null) : null;
    const group = community?.name ?? event.organizer ?? "Comunidad";

    return [
      {
        id: `manual-${event.slug}`,
        title: event.title,
        group,
        communitySlug: community?.slug ?? null,
        start: montevideoIso(event.start),
        end: event.end ? montevideoIso(event.end) : null,
        venue: event.venue,
        url: event.url,
        source: "manual",
        isOwu: isOwuName(group),
      },
    ];
  });

  return [...fromOwn, ...fromFeed, ...fromManual].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** An event stays listed until it ends (or two hours after it starts, when the end is unknown). */
export const isUpcoming = (event: CommunityEvent, now = Date.now()) =>
  (event.end ? Date.parse(event.end) : Date.parse(event.start) + 2 * 3_600_000) >= now;

/**
 * Every known upcoming event for the calendar feeds: the meetup-bot feed, the hand-curated list and
 * OWU's own, oldest first. OWU's called-off ones stay in, marked, so subscribed calendars drop them.
 */
export const getFeedEvents = cache(async (): Promise<CommunityEvent[]> => {
  const [feed, manual, communities, own] = await Promise.all([
    fetchFeed(),
    getManualEvents(),
    getCommunities(),
    fetchOwnEvents(),
  ]);

  return mergeEvents(feed, manual, communities, own).filter((event) => isUpcoming(event));
});

/** Every known upcoming event, as the agenda lists it: no called-off ones. */
export const getUpcomingEvents = cache(async (): Promise<CommunityEvent[]> =>
  (await getFeedEvents()).filter((event) => !event.cancelled)
);

/** The next event per directory entry */
export function nextEventByCommunity(events: CommunityEvent[]) {
  const next = new Map<string, CommunityEvent>();
  for (const event of events) {
    if (event.communitySlug && !next.has(event.communitySlug)) next.set(event.communitySlug, event);
  }

  return next;
}
