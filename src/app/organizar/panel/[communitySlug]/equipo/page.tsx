import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Notice } from "components/Admin/panel";
import { MembersSection } from "components/Admin/communities/MembersSection";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { ProfileOptIn } from "components/organizar/community/ProfileOptIn";
import { db } from "lib/db";
import { communityMembers } from "lib/db/schema";

import { holds, panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Equipo · Organizá" };

/** Who runs the community with what role; admins add people by email and change roles. */
export default async function TeamPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, name } = access.community;
  // Site staff without a membership have nothing to show on the profile
  const [membership] = await db
    .select({ showOnProfile: communityMembers.showOnProfile })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, id), eq(communityMembers.userId, access.session.user.id)));

  return (
    <PageContainer className="pb-6" size="small">
      <PageHeader description="Quiénes organizan y con qué rol. Los miembros ayudan en la puerta." title="Equipo" />
      {membership ? (
        <div className="mb-6">
          <ProfileOptIn communityId={id} communityName={name} initial={membership.showOnProfile} />
        </div>
      ) : null}
      {holds(access.community, "member:read") ? (
        <MembersSection communityId={id} communityName={name} permissions={access.community.permissions} />
      ) : (
        <Notice tone="info">Solo quienes administran la comunidad ven y cambian el equipo.</Notice>
      )}
    </PageContainer>
  );
}
