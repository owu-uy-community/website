import type { Metadata } from "next";
import type React from "react";
import { notFound } from "next/navigation";

import { AppProviders } from "components/providers/AppProviders";
import { publicCommunity } from "lib/tenant-server";

export async function generateMetadata({ params }: { params: Promise<{ communitySlug: string }> }): Promise<Metadata> {
  const { communitySlug } = await params;
  const community = await publicCommunity(communitySlug);

  return {
    title: community ? `${community.name} | owu.uy` : "Comunidad",
    description: community?.description ?? undefined,
  };
}

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  const community = await publicCommunity(communitySlug);

  if (!community || !community.isActive) {
    notFound();
  }

  // Follow buttons, RSVPs, tickets, surveys and the open-space screens all use React Query
  return <AppProviders>{children}</AppProviders>;
}
