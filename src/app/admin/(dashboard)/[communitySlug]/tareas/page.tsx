import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CalendarX2 } from "lucide-react";

import { isSiteAdmin, requireStaffSession } from "app/lib/auth-helpers";
import { Button } from "components/shared/ui/button";
import { Empty } from "components/shared/ui/empty";
import { db } from "lib/db";
import { communityMembers } from "lib/db/schema";
import { listCommunityMembers } from "lib/orpc/communities/services";
import { listStaffAnnouncements, listStaffTasks } from "lib/orpc/staff-tasks/services";

import { resolveAdminCommunityScope } from "../scope";
import TareasClient from "./TareasClient";

/**
 * Event-day staff coordination, community-scoped in the path. Unlike the rest
 * of /admin this page admits any community member (helpers check their tasks
 * from their phones); a slug outside the member's communities is a 404.
 */
export default async function TareasPage({
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
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Tareas</h1>
        <Empty
          action={
            admin ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/communities/${scope.community.slug}`}>Crear un evento</Link>
              </Button>
            ) : undefined
          }
          className="py-16"
          description={`${scope.community.name} todavía no tiene eventos.`}
          icon={CalendarX2}
          title="Sin eventos"
        />
      </div>
    );
  }

  const selected = scope.selected;

  const [tasks, announcements, roster, membership] = await Promise.all([
    listStaffTasks({ eventId: selected.id }),
    listStaffAnnouncements({ eventId: selected.id }, session.user.id, selected.communityId),
    listCommunityMembers({ communityId: selected.communityId }),
    admin
      ? Promise.resolve(null)
      : db
          .select({ role: communityMembers.role })
          .from(communityMembers)
          .where(
            and(eq(communityMembers.communityId, selected.communityId), eq(communityMembers.userId, session.user.id))
          )
          .then((rows) => rows[0] ?? null),
  ]);

  const canEdit = admin || (membership != null && ["owner", "admin", "editor"].includes(membership.role));

  return (
    <TareasClient
      canEdit={canEdit}
      eventId={selected.id}
      eventName={selected.name}
      initialAnnouncements={announcements}
      initialRoster={roster}
      initialTasks={tasks}
      meId={session.user.id}
      meName={session.user.name}
    />
  );
}
