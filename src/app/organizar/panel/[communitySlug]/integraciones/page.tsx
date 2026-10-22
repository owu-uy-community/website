import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IntegrationsClient } from "components/organizar/integrations/IntegrationsClient";

import { holds, panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Integraciones · Organizá" };

export default async function IntegrationsPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, slug, name } = access.community;

  return <IntegrationsClient community={{ id, slug, name }} isAdmin={holds(access.community, "integration:connect")} />;
}
