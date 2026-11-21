import { cacheLife } from "next/cache";

import { buildIcs } from "lib/community/ics";
import { SITE_URL } from "lib/community/site";
import { eventParams } from "lib/community/static-params";
import { placeLine } from "lib/organizar/calendar-links";
import { publicCaller } from "lib/orpc/server";

export const generateStaticParams = eventParams;

/**
 * One event as a calendar file, for Apple Calendar and anything else that opens .ics. Its UID is
 * the one the feeds use, so subscribing later doesn't duplicate it; a cancelled event says so.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ communitySlug: string; eventSlug: string }> }
) {
  const { communitySlug, eventSlug } = await params;
  const ics = await calendar(communitySlug, eventSlug);
  if (!ics) return new Response("Not found", { status: 404 });

  return new Response(ics.body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${ics.slug}.ics"`,
    },
  });
}

async function calendar(communitySlug: string, eventSlug: string) {
  "use cache";
  // The same freshness as the event page
  cacheLife("minutes");

  const event = await publicCaller.events.public({ communitySlug, eventSlug }).catch(() => null);
  if (!event) return null;

  const url = `${SITE_URL}/comunidad/${event.community.slug}/events/${event.slug}`;
  const body = buildIcs(
    [
      {
        id: `owu-${event.id}`,
        title: event.name,
        start: event.startDate,
        end: event.endDate,
        location: placeLine(event),
        url,
        description: [event.summary, `Organiza: ${event.community.name}`, url].filter(Boolean).join("\n"),
        cancelled: event.status === "cancelled",
      },
    ],
    { name: event.name, description: `${event.community.name} en owu.uy` }
  );

  return { body, slug: event.slug };
}
