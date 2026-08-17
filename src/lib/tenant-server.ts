import "server-only";

import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";

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
      .where(and(eq(events.communityId, community.id), eq(events.slug, eventSlug)))
      .limit(1);

    return event ? { community, event } : null;
  }
);

export const listCommunityEvents = cache(async (communityId: string): Promise<EventRow[]> => {
  return db
    .select()
    .from(events)
    .where(and(eq(events.communityId, communityId), eq(events.isActive, true)))
    .orderBy(desc(events.startDate));
});
