import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { and, eq } from "drizzle-orm";

import { EventDashboard } from "components/organizar/events/EventDashboard";
import { dayKey } from "lib/community/time";
import { db } from "lib/db";
import { events } from "lib/db/schema";

import { panelCommunity } from "../../../access";

export const metadata: Metadata = { title: "Evento · Organizá" };

/** A published event's dashboard; a draft opens its wizard instead. */
export default async function EventPage({ params }: { params: Promise<{ communitySlug: string; eventId: string }> }) {
  const { communitySlug, eventId } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const [row] = await db
    .select({ status: events.status })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.communityId, access.community.id)));
  if (!row) notFound();
  if (row.status === "draft") redirect(`/organizar/panel/${communitySlug}/eventos/${eventId}/editar`);
  const { id, slug, name } = access.community;

  return (
    <Suspense>
      <EventDashboard community={{ id, slug, name }} eventId={eventId} today={dayKey(new Date())} />
    </Suspense>
  );
}
