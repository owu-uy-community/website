import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { WelcomeSlides } from "components/organizar/events/WelcomeSlides";
import { db } from "lib/db";
import { events } from "lib/db/schema";

import { panelCommunity } from "../../../../access";

export const metadata: Metadata = { title: "Presentación · Organizá" };
export const instant = false;

/** The welcome slides for the room: full screen, arrows to move, printable. Organizers only (it has the wifi). */
export default async function SlidesPage({ params }: { params: Promise<{ communitySlug: string; eventId: string }> }) {
  const { communitySlug, eventId } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.communityId, access.community.id)));
  if (!event) notFound();

  return (
    <WelcomeSlides
      backHref={`/organizar/panel/${communitySlug}/eventos/${eventId}`}
      communityId={access.community.id}
      eventId={eventId}
    />
  );
}
