import "server-only";

import { and, eq, exists } from "drizzle-orm";

import { db } from "lib/db";
import { communities, events, schedules } from "lib/db/schema";
import { withPlaceholder } from "lib/revalidate";

/*
 * The community pages prerendered at build (Cache Components ISR): every listed community and its
 * published events. One added after the deploy renders on its first visit and is cached after it.
 * A build without the database gets the placeholder ("_" is never a slug), which renders the 404.
 */

const listed = and(eq(communities.listed, true), eq(communities.isActive, true));
const published = and(listed, eq(events.status, "published"), eq(events.isActive, true));

async function rows<T>(query: Promise<T[]>): Promise<T[]> {
  try {
    return await query;
  } catch (error) {
    console.error("[static-params] no database at build, prerendering the placeholder only", error);
    return [];
  }
}

export async function communityParams() {
  const slugs = await rows(db.select({ communitySlug: communities.slug }).from(communities).where(listed));

  return withPlaceholder(slugs, { communitySlug: "_" });
}

const eventPairs = { communitySlug: communities.slug, eventSlug: events.slug };

export async function eventParams() {
  const pairs = await rows(
    db.select(eventPairs).from(events).innerJoin(communities, eq(communities.id, events.communityId)).where(published)
  );

  return withPlaceholder(pairs, { communitySlug: "_", eventSlug: "_" });
}

/** Events with an open-space board */
export async function openSpaceParams() {
  const pairs = await rows(
    db
      .select(eventPairs)
      .from(events)
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(and(published, exists(db.select().from(schedules).where(eq(schedules.openSpaceId, events.id)))))
  );

  return withPlaceholder(pairs, { communitySlug: "_", eventSlug: "_" });
}
