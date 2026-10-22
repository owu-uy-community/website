import type React from "react";
import { notFound } from "next/navigation";

import { panelCommunity } from "../access";

/** Only the community's organizers (editor and up) and site staff get past here. */
export default async function CommunityPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  if (!(await panelCommunity(communitySlug))) notFound();

  return children;
}
