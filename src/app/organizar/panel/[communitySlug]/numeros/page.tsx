import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Notice } from "components/Admin/panel";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { NumbersClient } from "components/organizar/insights/NumbersClient";

import { holds, panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Números · Organizá" };
export const instant = false;

/** The community's numbers for its team (editors and up), its data to download (admins). */
export default async function NumbersPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { community } = access;

  return (
    <PageContainer>
      {holds(community, "event:stats") ? (
        <NumbersClient
          canExport={holds(community, "organization:update")}
          canExportAttendees={holds(community, "attendee:export")}
          canShare={holds(community, "organization:update")}
          communityId={community.id}
        />
      ) : (
        <>
          <PageHeader title="Números" />
          <Notice tone="info">Los números los ven quienes editan eventos. Pedíselos a alguien del equipo.</Notice>
        </>
      )}
    </PageContainer>
  );
}
