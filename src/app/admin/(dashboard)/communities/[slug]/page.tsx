import { notFound } from "next/navigation";

import { requirePermission } from "app/lib/auth-helpers";
import { caller } from "lib/orpc/server";

import CommunityDetailClient from "./CommunityDetailClient";

export default async function CommunityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePermission("organization:list");
  const { slug } = await params;

  const community = await caller.communities.getBySlug({ communitySlug: slug });
  if (!community) notFound();

  return <CommunityDetailClient key={community.id} initialCommunity={community} />;
}
