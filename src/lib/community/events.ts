import "server-only";

import { cache } from "react";
import * as z from "zod";

import { EXTERNAL_SERVICES } from "app/lib/constants";

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
  source: "meetup" | "manual";
  /** Organized by OWU itself (CONF, La Meetup) */
  isOwu: boolean;
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

export function mergeEvents(feed: FeedMeetup[], manual: ManualEvent[], communities: Community[]) {
  const byFeedName = new Map<string, Community>();
  for (const community of communities) {
    for (const name of [community.name, ...community.feedNames]) byFeedName.set(name.trim().toLowerCase(), community);
  }
  const bySlug = new Map(communities.map((community) => [community.slug, community]));

  const fromFeed = feed.map((meetup): CommunityEvent => {
    const community = byFeedName.get(meetup.name.trim().toLowerCase()) ?? null;

    return {
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
    };
  });

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

  return [...fromFeed, ...fromManual].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** An event stays listed until it ends (or two hours after it starts, when the end is unknown). */
export const isUpcoming = (event: CommunityEvent, now = Date.now()) =>
  (event.end ? Date.parse(event.end) : Date.parse(event.start) + 2 * 3_600_000) >= now;

/** Every known upcoming event: the meetup-bot feed plus the hand-curated list, oldest first. */
export const getUpcomingEvents = cache(async (): Promise<CommunityEvent[]> => {
  const [feed, manual, communities] = await Promise.all([fetchFeed(), getManualEvents(), getCommunities()]);

  return mergeEvents(feed, manual, communities).filter((event) => isUpcoming(event));
});

/** The next event per directory entry */
export function nextEventByCommunity(events: CommunityEvent[]) {
  const next = new Map<string, CommunityEvent>();
  for (const event of events) {
    if (event.communitySlug && !next.has(event.communitySlug)) next.set(event.communitySlug, event);
  }

  return next;
}
