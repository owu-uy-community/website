import { cacheLife } from "next/cache";

import { getArchive, getTimeline } from "lib/timeline/data";
import { organizersOf } from "lib/timeline/people";
import type { TimelineCommunity, TimelineEvent, TimelinePersonChip } from "lib/timeline/types";

/** What the archive's detail panel shows for one event: the event, its organizers, its community and its neighbours there */
export type EventDetail = {
  event: TimelineEvent;
  organizers: TimelinePersonChip[];
  community: Pick<TimelineCommunity, "slug" | "name" | "logo" | "status" | "events" | "directory" | "photos"> | null;
  previous: { slug: string; title: string; start: string } | null;
  next: { slug: string; title: string; start: string } | null;
};

async function render(slug: string) {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { events, bySlug, community: communities } = getTimeline();
  const event = bySlug.get(slug);
  if (!event) return null;

  const community = communities.get(event.community);
  const same = events.filter((e) => e.community === event.community);
  const index = same.indexOf(event);
  const pick = (e?: TimelineEvent) => (e ? { slug: e.slug, title: e.title, start: e.start } : null);
  const detail: EventDetail = {
    event,
    organizers: organizersOf(event),
    community: community
      ? {
          slug: community.slug,
          name: community.name,
          logo: community.logo,
          status: community.status,
          // The archive's count, so the panel says the same before and after it loads
          events: getArchive().communities.find((c) => c.slug === community.slug)?.events ?? community.events,
          directory: community.directory,
          photos: community.photos,
        }
      : null,
    previous: pick(same[index - 1]),
    next: pick(same[index + 1]),
  };
  return JSON.stringify(detail);
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const body = await render((await params).slug);
  if (!body) return new Response("No existe", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=86400",
    },
  });
}
