import type { Metadata } from "next";
import type React from "react";
import { notFound } from "next/navigation";

import { getCommunityBySlug } from "lib/tenant-server";

export async function generateMetadata({ params }: { params: Promise<{ communitySlug: string }> }): Promise<Metadata> {
  const { communitySlug } = await params;
  const community = await getCommunityBySlug(communitySlug);

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
  const community = await getCommunityBySlug(communitySlug);

  if (!community || !community.isActive) {
    notFound();
  }

  return children;
}
