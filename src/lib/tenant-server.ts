import "server-only";

import { cache } from "react";
import { and, desc, eq, ne } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { db } from "./db";
import { communities, events, type CommunityRow, type EventRow } from "./db/schema";

/**
 * Server-side tenant resolution for /comunidad/[communitySlug] pages. Wrapped in
 * React cache() so layouts and pages share one lookup per request.
 */
export const getCommunityBySlug = cache(async (slug: string): Promise<CommunityRow | null> => {
  const [community] = await db.select().from(communities).where(eq(communities.slug, slug)).limit(1);

  return community ?? null;
});

export const getEventBySlugs = cache(
  async (communitySlug: string, eventSlug: string): Promise<{ community: CommunityRow; event: EventRow } | null> => {
    const community = await getCommunityBySlug(communitySlug);
    if (!community) return null;

    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.communityId, community.id), eq(events.slug, eventSlug), ne(events.status, "draft")))
      .limit(1);

    return event ? { community, event } : null;
  }
);

export const listCommunityEvents = cache(async (communityId: string): Promise<EventRow[]> => {
  return db
    .select()
    .from(events)
    .where(and(eq(events.communityId, communityId), eq(events.isActive, true), ne(events.status, "draft")))
    .orderBy(desc(events.startDate));
});

/*
 * The same lookups for the public community pages, cached (Cache Components): pages built on them
 * prerender, refresh on their cacheLife, and publishing refreshes them sooner (revalidatePath). The
 * API and the per-request screens keep reading the database directly.
 */

export async function publicCommunity(slug: string): Promise<CommunityRow | null> {
  "use cache";
  cacheLife("hours");

  return getCommunityBySlug(slug);
}

export async function publicEvent(communitySlug: string, eventSlug: string) {
  "use cache";
  // Seats left and who's going change; a minute old is fine
  cacheLife("minutes");

  return getEventBySlugs(communitySlug, eventSlug);
}
