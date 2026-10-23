import type { Metadata } from "next";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Notice } from "components/Admin/panel";
import { CommunityRolesSection } from "components/Admin/communities/CommunityRolesSection";
import { MembersSection } from "components/Admin/communities/MembersSection";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { ProfileOptIn } from "components/organizar/community/ProfileOptIn";
import { TeamCare } from "components/organizar/community/TeamCare";
import { db } from "lib/db";
import { communityMembers, events, rooms } from "lib/db/schema";

import { holds, panelCommunity } from "../../access";
import { LeaveTeam } from "./LeaveTeam";

export const metadata: Metadata = { title: "Equipo · Organizá" };

/**
 * Who runs the community with what role; admins add people by email or OWU Slack, answer requests
 * to join and define the community's own roles. Members may leave.
 */
export default async function TeamPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, name, permissions } = access.community;
  // Site staff without a membership have nothing to show on the profile, nor a team to leave
  const [[membership], [conf]] = await Promise.all([
    db
      .select({ showOnProfile: communityMembers.showOnProfile })
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, id), eq(communityMembers.userId, access.session.user.id))),
    // An open space, or any event with rooms: then rooms, tasks and the incident desk mean something
    db
      .select({ id: events.id })
      .from(events)
      .leftJoin(rooms, eq(rooms.openSpaceId, events.id))
      .where(and(eq(events.communityId, id), or(eq(events.format, "open-space"), isNotNull(rooms.id))))
      .limit(1),
  ]);
  const meetup = !conf;

  return (
    <PageContainer className="pb-6" size="small">
      <PageHeader description="Quiénes organizan y con qué rol. Los miembros ayudan en la puerta." title="Equipo" />
      {membership ? (
        <div className="mb-6">
          <ProfileOptIn communityId={id} communityName={name} initial={membership.showOnProfile} />
        </div>
      ) : null}
      {holds(access.community, "member:read") ? (
        <MembersSection communityId={id} communityName={name} meetup={meetup} permissions={permissions} />
      ) : (
        <Notice tone="info">Solo quienes administran la comunidad ven y cambian el equipo.</Notice>
      )}
      <TeamCare communityId={id} />
      {holds(access.community, "role:read") ? (
        <div className="mt-8">
          <CommunityRolesSection communityId={id} meetup={meetup} permissions={permissions} />
        </div>
      ) : null}
      {membership ? <LeaveTeam communityId={id} communityName={name} /> : null}
    </PageContainer>
  );
}
