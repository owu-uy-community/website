import type React from "react";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "lib/db";
import { communities } from "lib/db/schema";

import { panelAccess, panelCommunity } from "../access";
import { NoAccess } from "./NoAccess";

/**
 * Only the community's organizers (editor and up) and site staff get past here. Anyone else signed
 * in sees why and can ask for access; a community that doesn't exist is a 404.
 */
export default async function CommunityPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  if (await panelCommunity(communitySlug)) return children;

  const [community] = await db
    .select({ id: communities.id, slug: communities.slug, name: communities.name })
    .from(communities)
    .where(and(eq(communities.slug, communitySlug), eq(communities.isActive, true)));
  if (!community) notFound();
  // Memoized per request: panelCommunity already read it (and sent anyone signed out to log in)
  const { session } = await panelAccess(`/organizar/panel/${communitySlug}`);

  return <NoAccess community={community} userId={session.user.id} />;
}
