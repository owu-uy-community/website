import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { ConductReports } from "components/organizar/events/ConductReports";
import { db } from "lib/db";
import { events } from "lib/db/schema";

import { panelCommunity } from "../../../../access";

export const metadata: Metadata = { title: "Conducta · Organizá" };

/** The event's code-of-conduct reports: its responders and OWU's conduct staff read them here. */
export default async function ConductPage({ params }: { params: Promise<{ communitySlug: string; eventId: string }> }) {
  const { communitySlug, eventId } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.communityId, access.community.id)));
  if (!row) notFound();

  return <ConductReports communitySlug={communitySlug} eventId={eventId} />;
}
