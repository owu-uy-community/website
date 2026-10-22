import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ProfileClient } from "components/organizar/community/ProfileClient";
import { callerFor } from "lib/orpc/server";
import { ROLE_RANK } from "lib/roles";

import { panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Perfil · Organizá" };

export default async function ProfilePage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const community = await callerFor(await headers()).communities.getBySlug({ communitySlug });
  if (!community) notFound();

  return <ProfileClient canEdit={ROLE_RANK[access.community.role] >= ROLE_RANK.admin} initialCommunity={community} />;
}
