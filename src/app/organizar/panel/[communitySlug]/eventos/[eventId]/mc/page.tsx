import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { McMode } from "components/organizar/events/McMode";
import { db } from "lib/db";
import { events } from "lib/db/schema";

import { panelCommunity } from "../../../../access";

export const metadata: Metadata = { title: "Modo MC · Organizá" };
export const instant = false;

/** MC mode: the agenda on the presenter's phone, with what's on now, its countdown and "Siguiente". */
export default async function McPage({ params }: { params: Promise<{ communitySlug: string; eventId: string }> }) {
  const { communitySlug, eventId } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const [event] = await db
    .select({ name: events.name, status: events.status })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.communityId, access.community.id)));
  if (!event || event.status === "draft") notFound();

  return (
    <McMode
      backHref={`/organizar/panel/${communitySlug}/eventos/${eventId}`}
      communityId={access.community.id}
      eventId={eventId}
      eventName={event.name}
    />
  );
}
