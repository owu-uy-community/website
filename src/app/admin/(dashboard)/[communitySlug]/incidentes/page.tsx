import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CalendarX2 } from "lucide-react";

import { isSiteAdmin, requireStaffSession } from "app/lib/auth-helpers";
import { IncidentsPage } from "components/Admin/incidents/IncidentsPage";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { db } from "lib/db";
import { communityMembers } from "lib/db/schema";

import { resolveAdminCommunityScope } from "../scope";

/**
 * The event's incidents. Like Tareas, any member of the community gets in: everyone on the
 * staff reports and follows incidents from their phone; a slug outside their communities is a 404.
 */
export default async function IncidentesPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const session = await requireStaffSession();
  const admin = isSiteAdmin(session);

  const { communitySlug } = await params;
  const { event: eventSlug } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, admin ? null : session.user.id);
  if (!scope) notFound();

  if (!scope.selected) {
    return (
      <PageContainer size="small">
        <PageHeader title="Incidentes" />
        <EmptyState
          action={
            admin ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/communities/${scope.community.slug}`}>Crear un evento</Link>
              </Button>
            ) : undefined
          }
          description={`${scope.community.name} todavía no tiene eventos.`}
          icon={CalendarX2}
          title="Sin eventos"
        />
      </PageContainer>
    );
  }

  const [membership] = admin
    ? []
    : await db
        .select({ role: communityMembers.role })
        .from(communityMembers)
        .where(and(eq(communityMembers.communityId, scope.community.id), eq(communityMembers.userId, session.user.id)));
  // Editors manage incidents; the API enforces it, this only decides which controls to show.
  const canEdit = admin || (membership !== undefined && membership.role !== "member");

  return <IncidentsPage canEdit={canEdit} eventId={scope.selected.id} meId={session.user.id} />;
}
