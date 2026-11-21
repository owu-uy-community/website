import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { ArrowUpRight, Lock } from "lucide-react";

import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { roleLabel } from "lib/authz/labels";
import { db } from "lib/db";
import { accessRequests, communityMembers, communityRoles, user } from "lib/db/schema";

import { RequestAccess } from "./RequestAccess";

/**
 * Someone signed in opened a community's panel without organizing it: what they are there, who
 * runs it (only those who chose to appear on its page) and a way to ask for access.
 */
export async function NoAccess({
  community,
  userId,
}: {
  community: { id: string; slug: string; name: string };
  userId: string;
}) {
  const [[membership], admins, [pending]] = await Promise.all([
    db
      .select({ role: communityMembers.role, label: communityRoles.label })
      .from(communityMembers)
      .leftJoin(
        communityRoles,
        and(
          eq(communityRoles.communityId, communityMembers.communityId),
          eq(communityRoles.role, communityMembers.role)
        )
      )
      .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, userId))),
    db
      .select({ name: user.name })
      .from(communityMembers)
      .innerJoin(user, eq(user.id, communityMembers.userId))
      .where(
        and(
          eq(communityMembers.communityId, community.id),
          inArray(communityMembers.role, ["owner", "admin"]),
          eq(communityMembers.showOnProfile, true)
        )
      )
      .orderBy(user.name),
    db
      .select({ id: accessRequests.id })
      .from(accessRequests)
      .where(
        and(
          eq(accessRequests.userId, userId),
          eq(accessRequests.communityId, community.id),
          eq(accessRequests.status, "pending")
        )
      ),
  ]);
  const names = new Intl.ListFormat("es", { type: "conjunction" }).format(admins.map((admin) => admin.name));

  return (
    <PageContainer>
      <PageHeader
        description="El panel de cada comunidad es para quienes la organizan."
        title={`No tenés acceso a ${community.name}`}
      />
      <Panel className="max-w-2xl">
        <PanelHead icon={Lock} title="Tu lugar en la comunidad" />
        <div className="flex flex-col gap-4 p-4 text-ui text-foreground">
          <p>
            {membership ? (
              <>
                Sos <strong className="font-medium">{roleLabel(membership.role, membership.label)}</strong> de{" "}
                {community.name}: ayudás el día del evento, pero para armar eventos hace falta un rol de quienes
                organizan.
              </>
            ) : (
              <>Todavía no sos parte del equipo de {community.name}.</>
            )}
          </p>
          <p className="text-muted-foreground">
            {admins.length > 0
              ? `La administran ${names}.`
              : "Quienes la administran no figuran en su página pública, pero tu pedido les llega igual."}
          </p>
          <RequestAccess communityId={community.id} pending={Boolean(pending)} />
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button asChild size="sm" variant="outline">
              <Link href={`/comunidad/${community.slug}`}>
                Ver la página de {community.name}
                <ArrowUpRight />
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/organizar/panel/reclamar">¿Organizás otra comunidad?</Link>
            </Button>
          </div>
        </div>
      </Panel>
    </PageContainer>
  );
}
