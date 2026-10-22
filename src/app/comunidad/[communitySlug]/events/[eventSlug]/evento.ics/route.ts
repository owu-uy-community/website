import { buildIcs } from "lib/community/ics";
import { SITE_URL } from "lib/community/site";
import { placeLine } from "lib/organizar/calendar-links";
import { publicCaller } from "lib/orpc/server";

// The same freshness as the event page
export const revalidate = 60;

/**
 * One event as a calendar file, for Apple Calendar and anything else that opens .ics. Its UID is
 * the one the feeds use, so subscribing later doesn't duplicate it; a cancelled event says so.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ communitySlug: string; eventSlug: string }> }
) {
  const { communitySlug, eventSlug } = await params;
  const event = await publicCaller.events.public({ communitySlug, eventSlug }).catch(() => null);
  if (!event) return new Response("Not found", { status: 404 });

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

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${event.slug}.ics"`,
    },
  });
}
