import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IntegrationsClient } from "components/organizar/integrations/IntegrationsClient";
import { ROLE_RANK } from "lib/roles";

import { panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Integraciones · Organizá" };

export default async function IntegrationsPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, slug, name, role } = access.community;

  return <IntegrationsClient community={{ id, slug, name }} isAdmin={ROLE_RANK[role] >= ROLE_RANK.admin} />;
}
