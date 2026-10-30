import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VenuesClient } from "components/organizar/venues/VenuesClient";
import { dayKey } from "lib/community/time";

import { panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Espacios · Organizá" };
export const instant = false;

export default async function VenuesPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, slug, name } = access.community;

  return <VenuesClient community={{ id, slug, name }} today={dayKey(new Date())} />;
}
