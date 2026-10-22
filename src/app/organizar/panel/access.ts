import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "app/lib/auth";
import type { PanelCommunity } from "components/organizar/shell/context";
import { callerFor } from "lib/orpc/server";
import { ROLE_RANK } from "lib/orpc/scope";

/**
 * Who is in the panel and which communities they run: editor or above (members help at the door,
 * they don't organize). Site staff get every active community. Memoized per request, so the
 * layouts and the page share one lookup.
 */
export const panelAccess = cache(async (next = "/organizar/panel") => {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);

  const api = callerFor(requestHeaders);
  const isStaff = session.user.role === "admin";
  const mine = await api.communities.mine();
  const organized: PanelCommunity[] = mine.communities.filter(
    (community) => ROLE_RANK[community.role] >= ROLE_RANK.editor
  );

  if (!isStaff) return { session, isStaff, communities: organized, claims: mine.claims };

  const all = await api.communities.list();
  const own = new Map(organized.map((community) => [community.id, community]));
  const communities = all.map(
    (community): PanelCommunity =>
      own.get(community.id) ?? {
        id: community.id,
        slug: community.slug,
        name: community.name,
        logoUrl: community.logoUrl,
        role: "admin",
      }
  );

  return { session, isStaff, communities, claims: mine.claims };
});

/** The community in the URL, or a 404 for someone who doesn't organize it. */
export async function panelCommunity(communitySlug: string) {
  const access = await panelAccess(`/organizar/panel/${communitySlug}`);
  const community = access.communities.find((item) => item.slug === communitySlug);

  return community ? { ...access, community } : null;
}
