import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarX2 } from "lucide-react";

import { requireDashboardAccess } from "app/lib/auth-helpers";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { db } from "lib/db";
import { events } from "lib/db/schema";
import { caller } from "lib/orpc/server";

import { resolveAdminCommunityScope } from "../scope";
import MiTurnoClient from "./MiTurnoClient";

/**
 * A staff member's day on their phone: the urgent announcement waiting for them, "Llegué",
 * their tasks in order and the quick actions. Any community member; another community's slug
 * is a 404.
 */
export default async function MiTurnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { session } = await requireDashboardAccess();
  const { communitySlug } = await params;
  const { event: eventSlug } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, "task:read");
  if (!scope) notFound();

  if (!scope.selected) {
    return (
      <PageContainer size="small">
        <PageHeader title="Mi turno" />
        <EmptyState
          description={`${scope.community.name} todavía no tiene eventos.`}
          icon={CalendarX2}
          title="Sin eventos"
        />
      </PageContainer>
    );
  }

  const selected = scope.selected;
  const input = { eventId: selected.id };
  const [tasks, announcements, arrivals, [event]] = await Promise.all([
    caller.staffTasks.list(input),
    caller.staffTasks.announcements.list(input),
    caller.staffTasks.arrivals.list(input),
    db.select({ timezone: events.timezone }).from(events).where(eq(events.id, selected.id)),
  ]);

  return (
    <MiTurnoClient
      communitySlug={scope.community.slug}
      eventId={selected.id}
      eventName={selected.name}
      eventSlug={selected.slug}
      initialAnnouncements={announcements}
      initialArrivals={arrivals}
      initialTasks={tasks}
      me={{ id: session.user.id, name: session.user.name, image: session.user.image ?? null }}
      serverNow={Date.now()}
      timeZone={event?.timezone ?? "America/Montevideo"}
    />
  );
}
