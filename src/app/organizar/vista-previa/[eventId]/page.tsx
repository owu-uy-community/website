import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "app/lib/auth";
import { EventPage } from "components/community/event/EventPage";
import { SiteChrome } from "components/community/SiteChrome";
import { db } from "lib/db";
import { events } from "lib/db/schema";
import { SITE_URL } from "lib/community/site";
import { callerFor } from "lib/orpc/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vista previa · Organizá", robots: { index: false, follow: false } };

/** A draft (or any event) as its public page will show it, for its organizers only. */
export default async function PreviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(`/login?next=/organizar/vista-previa/${eventId}`);

  const [row] = await db.select({ communityId: events.communityId }).from(events).where(eq(events.id, eventId));
  if (!row) notFound();
  const event = await callerFor(requestHeaders)
    .events.preview({ communityId: row.communityId, eventId })
    .catch(() => null);
  if (!event) notFound();

  return (
    <SiteChrome>
      <EventPage
        banner={
          <div className="relative z-30 border-b border-yellow-400/30 bg-yellow-400/10 px-5 py-2.5 text-center text-[14px] text-yellow-100">
            Vista previa: así se ve {event.status === "draft" ? "cuando lo publiques" : "hoy"}. Solo la ven quienes
            organizan.
          </div>
        }
        event={event}
        url={`${SITE_URL}/comunidad/${event.community.slug}/events/${event.slug}`}
      />
    </SiteChrome>
  );
}
