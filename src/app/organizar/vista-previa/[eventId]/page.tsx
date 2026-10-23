import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { sessionFor, signInAgain } from "app/lib/auth-helpers";
import { EventPage } from "components/community/event/EventPage";
import { SiteChrome } from "components/community/SiteChrome";
import { buttonClassName, Container } from "components/community/ui";
import { db } from "lib/db";
import { communities, events } from "lib/db/schema";
import { SITE_URL } from "lib/community/site";
import { callerFor } from "lib/orpc/server";

// An organizer's draft, behind their session: rendered per request, allowed to block (Cache Components)
export const instant = false;
export const metadata: Metadata = { title: "Vista previa · Organizá", robots: { index: false, follow: false } };

/** "Doesn't exist" and "not yours" are a 404; anything else is a load that failed and can be retried. */
const isMissing = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error.code === "NOT_FOUND" || error.code === "FORBIDDEN");

/** A draft (or any event) as its public page will show it, for its organizers only. */
export default async function PreviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const requestHeaders = await headers();
  const session = await sessionFor(requestHeaders);
  if (!session) return signInAgain(`/organizar/vista-previa/${eventId}`);

  const result = await db
    .select({ communityId: events.communityId, status: events.status, slug: communities.slug })
    .from(events)
    .innerJoin(communities, eq(communities.id, events.communityId))
    .where(eq(events.id, eventId))
    .then(async ([row]) => {
      if (!row) return { missing: true as const };
      const event = await callerFor(requestHeaders).events.preview({ communityId: row.communityId, eventId });

      return { row, event };
    })
    .catch((error: unknown) => (isMissing(error) ? { missing: true as const } : { failed: true as const }));
  if ("missing" in result) notFound();
  if ("failed" in result) {
    return (
      <SiteChrome>
        <Container className="flex min-h-[50vh] flex-col items-start justify-center gap-4 py-16">
          <h1 className="font-title text-2xl font-bold text-white">No pudimos cargar la vista previa</h1>
          <p className="text-[15px] text-zinc-300">
            Fue un problema nuestro o de la conexión. Probá de nuevo en un rato.
          </p>
          <a className={buttonClassName("secondary", "md")} href={`/organizar/vista-previa/${eventId}`}>
            Probar de nuevo
          </a>
        </Container>
      </SiteChrome>
    );
  }
  const { row, event } = result;
  const back = `/organizar/panel/${row.slug}/eventos/${eventId}${row.status === "draft" ? "/editar" : ""}`;

  return (
    <SiteChrome>
      <EventPage
        banner={
          <div className="relative z-30 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-yellow-400/30 bg-yellow-400/10 px-5 py-2.5 text-center text-[14px] text-yellow-100">
            <span>
              Vista previa: así se ve {event.status === "draft" ? "cuando lo publiques" : "hoy"}. Solo la ven quienes
              organizan.
            </span>
            <Link className="font-semibold text-yellow-50 underline underline-offset-4" href={back}>
              Volver al evento
            </Link>
          </div>
        }
        event={event}
        rsvp={
          // The real card signs people up: here it only shows where it goes
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <button className={buttonClassName("primary", "lg", "w-full")} disabled type="button">
              Anotarme
            </button>
            <p className="text-[14px] text-zinc-400">En la vista previa nadie se puede anotar.</p>
          </div>
        }
        url={`${SITE_URL}/comunidad/${event.community.slug}/events/${event.slug}`}
      />
    </SiteChrome>
  );
}
