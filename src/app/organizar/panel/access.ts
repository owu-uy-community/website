import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { currentPrincipal, currentSession } from "app/lib/auth-helpers";
import type { PanelCommunity } from "components/organizar/shell/context";
import { grantsHold, permissionsOf } from "lib/authz/catalog";
import { roleLabel } from "lib/authz/labels";
import { grantsIn, platformGrants } from "lib/authz/principal";
import { db } from "lib/db";
import { communityRoles } from "lib/db/schema";
import { caller } from "lib/orpc/server";

/**
 * Who is in the panel and which communities they run: where they may open events (`event:read`:
 * editors and above, or a custom role that holds it; members help at the door, they don't
 * organize). People who hold it on the platform (site staff) get every active community.
 * Memoized per request, so the layouts and the page share one lookup.
 */
export const panelAccess = cache(async (next = "/organizar/panel") => {
  const [session, principal] = await Promise.all([currentSession(), currentPrincipal()]);
  if (!session || !principal || principal.banned) redirect(`/login?next=${encodeURIComponent(next)}`);

  const isStaff = grantsHold(platformGrants(principal), "event:read");
  const mine = await caller.communities.mine();
  const candidates = isStaff
    ? (await caller.communities.list()).map((community) => ({
        ...community,
        role: mine.communities.find((own) => own.id === community.id)?.role ?? "admin",
      }))
    : mine.communities;

  const custom = await db
    .select({ communityId: communityRoles.communityId, role: communityRoles.role, label: communityRoles.label })
    .from(communityRoles)
    .where(
      candidates.length > 0
        ? and(
            inArray(
              communityRoles.communityId,
              candidates.map((community) => community.id)
            ),
            inArray(
              communityRoles.role,
              candidates.map((community) => community.role)
            )
          )
        : eq(communityRoles.id, "")
    );

  const communities: PanelCommunity[] = [];
  for (const community of candidates) {
    const permissions = permissionsOf(await grantsIn(principal, community.id));
    if (!permissions.includes("event:read")) continue;
    const label = custom.find((row) => row.communityId === community.id && row.role === community.role)?.label;
    communities.push({
      id: community.id,
      slug: community.slug,
      name: community.name,
      logoUrl: community.logoUrl,
      role: community.role,
      roleLabel:
        isStaff && !mine.communities.some((own) => own.id === community.id)
          ? "Staff de OWU"
          : roleLabel(community.role, label),
      permissions,
    });
  }

  return { session, principal, isStaff, communities, claims: mine.claims };
});

/** The community in the URL, or a 404 for someone who doesn't organize it. */
export async function panelCommunity(communitySlug: string) {
  const access = await panelAccess(`/organizar/panel/${communitySlug}`);
  const community = access.communities.find((item) => item.slug === communitySlug);

  return community ? { ...access, community } : null;
}

/** True when the viewer holds `permission` in the panel's community. */
export const holds = (community: Pick<PanelCommunity, "permissions">, permission: string) =>
  community.permissions.includes(permission);
