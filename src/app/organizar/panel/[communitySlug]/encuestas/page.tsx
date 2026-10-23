import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PollsClient } from "components/organizar/polls/PollsClient";
import { dayKey } from "lib/community/time";

import { panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Votar fecha · Organizá" };

export default async function PollsPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, slug, name } = access.community;

  return <PollsClient community={{ id, slug, name }} today={dayKey(new Date())} />;
}
