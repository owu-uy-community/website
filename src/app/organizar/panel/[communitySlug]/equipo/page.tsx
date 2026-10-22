import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Notice } from "components/Admin/panel";
import { MembersSection } from "components/Admin/communities/MembersSection";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { ROLE_RANK } from "lib/roles";

import { panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Equipo · Organizá" };

/** Who runs the community with what role; admins add people by email and change roles. */
export default async function TeamPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, name, role } = access.community;

  return (
    <PageContainer className="pb-6" size="small">
      <PageHeader description="Quiénes organizan y con qué rol. Los miembros ayudan en la puerta." title="Equipo" />
      {ROLE_RANK[role] >= ROLE_RANK.admin ? (
        <MembersSection communityId={id} communityName={name} />
      ) : (
        <Notice tone="info">Solo los admins de la comunidad ven y cambian el equipo.</Notice>
      )}
    </PageContainer>
  );
}
