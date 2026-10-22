import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CalendarX2 } from "lucide-react";

import { isSiteAdmin, requireStaffSession } from "app/lib/auth-helpers";
import { TAREAS_TABS, type TareasTab } from "components/Admin/tareas/helpers";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { db } from "lib/db";
import { communityMembers, events } from "lib/db/schema";
import { caller } from "lib/orpc/server";

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
  searchParams: Promise<{ event?: string; tab?: string }>;
}) {
  const session = await requireStaffSession();
  const admin = isSiteAdmin(session);

  const { communitySlug } = await params;
  const { event: eventSlug, tab } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, admin ? null : session.user.id);
  if (!scope) notFound();

  if (!scope.selected) {
    return (
      <PageContainer size="small">
        <PageHeader title="Staff y tareas" />
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

  const selected = scope.selected;
  const input = { eventId: selected.id };
  const [tasks, announcements, roster, arrivals, onShift, [event], membership] = await Promise.all([
    caller.staffTasks.list(input),
    caller.staffTasks.announcements.list(input),
    caller.staffTasks.roster(input),
    caller.staffTasks.arrivals.list(input),
    caller.staffTasks.onShift(input),
    db.select({ timezone: events.timezone }).from(events).where(eq(events.id, selected.id)),
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
  const initialTab = TAREAS_TABS.find((candidate): candidate is TareasTab => candidate === tab) ?? "ahora";

  return (
    <TareasClient
      canEdit={canEdit}
      communitySlug={scope.community.slug}
      eventId={selected.id}
      eventName={selected.name}
      eventSlug={selected.slug}
      initialAnnouncements={announcements}
      initialArrivals={arrivals}
      initialOnShift={onShift}
      initialRoster={roster}
      initialTab={initialTab}
      initialTasks={tasks}
      me={{ id: session.user.id, name: session.user.name, image: session.user.image ?? null }}
      serverNow={Date.now()}
      timeZone={event?.timezone ?? "America/Montevideo"}
    />
  );
}
