import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { Scanner } from "components/Admin/attendees/Scanner";
import { db } from "lib/db";
import { events } from "lib/db/schema";
import { ROLE_RANK } from "lib/roles";

import { panelCommunity } from "../../../../../access";

export const metadata: Metadata = { title: "Escáner · Organizá" };

/**
 * OWU's door scanner for the event's admins, signed in (it reads names and emails). Members and
 * volunteers use the door link instead, which needs no account and shows no emails.
 */
export default async function ScannerPage({ params }: { params: Promise<{ communitySlug: string; eventId: string }> }) {
  const { communitySlug, eventId } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access || ROLE_RANK[access.community.role] < ROLE_RANK.admin) notFound();
  const [event] = await db
    .select({ name: events.name, timezone: events.timezone, status: events.status })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.communityId, access.community.id)));
  if (!event || event.status === "draft") notFound();

  return (
    <Scanner
      backHref={`/organizar/panel/${communitySlug}/eventos/${eventId}?tab=puerta`}
      eventId={eventId}
      eventName={event.name}
      timezone={event.timezone}
    />
  );
}
