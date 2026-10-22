import { eq } from "drizzle-orm";

import { hasPermission } from "app/lib/auth-helpers";
import type { Permission } from "lib/authz/catalog";
import { db } from "lib/db";
import { communities } from "lib/db/schema";
import type { AdminEventOption } from "lib/orpc/open-spaces/schemas";
import { caller } from "lib/orpc/server";

export type AdminCommunityScope = {
  community: { id: string; name: string; slug: string };
  /** This community's events, newest first. */
  events: AdminEventOption[];
  /** `?event=` within the community, defaulting to the newest event. */
  selected: AdminEventOption | null;
};

/**
 * Resolves `/admin/[communitySlug]/*` for the current viewer: the community, when they hold the
 * page's `permission` there (through a role in it, or a platform role that holds it everywhere).
 * Anything else is a 404, so URLs can't be used to probe other communities.
 */
export async function resolveAdminCommunityScope(
  communitySlug: string,
  eventSlug: string | undefined,
  permission: Permission
): Promise<AdminCommunityScope | null> {
  const [community] = await db
    .select({ id: communities.id, name: communities.name, slug: communities.slug })
    .from(communities)
    .where(eq(communities.slug, communitySlug));
  if (!community || !(await hasPermission(permission, community.id))) return null;

  const events = (await caller.openSpaces.listForAdmin()).filter((event) => event.communityId === community.id);
  const selected = (eventSlug ? events.find((event) => event.slug === eventSlug) : events[0]) ?? events[0] ?? null;

  return { community, events, selected };
}
