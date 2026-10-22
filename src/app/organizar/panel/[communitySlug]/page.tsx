import { notFound } from "next/navigation";

import { HomeClient } from "components/organizar/home/HomeClient";
import { dayKey } from "lib/community/time";

import { panelCommunity } from "../access";

export default async function PanelHome({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, slug, name } = access.community;

  return <HomeClient community={{ id, slug, name }} today={dayKey(new Date())} />;
}
