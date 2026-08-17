import type { Metadata } from "next";
import type React from "react";
import { notFound } from "next/navigation";

import { getEventBySlugs } from "lib/tenant-server";

type Params = Promise<{ communitySlug: string; eventSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);

  return {
    title: resolved ? `${resolved.event.name} · ${resolved.community.name}` : "Evento",
  };
}

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);

  if (!resolved || !resolved.event.isActive) {
    notFound();
  }

  return children;
}
