import { and, eq } from "drizzle-orm";

import { db } from "lib/db";
import { communities, communityMembers } from "lib/db/schema";
import { listEventsForOperator, type AdminEventOption } from "lib/orpc/open-spaces/services/get-all";

export type AdminCommunityScope = {
  community: { id: string; name: string; slug: string };
  /** This community's events, newest first. */
  events: AdminEventOption[];
  /** `?event=` within the community, defaulting to the newest event. */
  selected: AdminEventOption | null;
};

/**
 * Resolves `/admin/[communitySlug]/*` for the current operator.
 * `userId === null` means site staff (any community); otherwise the slug must
 * be a community the user is a member of — anything else is a 404, so member
 * URLs can't be used to probe other tenants.
 */
export async function resolveAdminCommunityScope(
  communitySlug: string,
  eventSlug: string | undefined,
  userId: string | null
): Promise<AdminCommunityScope | null> {
  const selection = { id: communities.id, name: communities.name, slug: communities.slug };

  const rows =
    userId === null
      ? await db.select(selection).from(communities).where(eq(communities.slug, communitySlug))
      : await db
          .select(selection)
          .from(communities)
          .innerJoin(
            communityMembers,
            and(eq(communityMembers.communityId, communities.id), eq(communityMembers.userId, userId))
          )
          .where(eq(communities.slug, communitySlug));

  const community = rows[0];
  if (!community) return null;

  const events = (await listEventsForOperator(userId)).filter((event) => event.communityId === community.id);
  const selected = (eventSlug ? events.find((event) => event.slug === eventSlug) : events[0]) ?? events[0] ?? null;

  return { community, events, selected };
}
