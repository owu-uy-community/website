import { getFeedEvents } from "lib/community/events";
import { buildIcs } from "lib/community/ics";
import { SITE_URL } from "lib/community/site";

// Calendar apps poll this; it follows the same hourly refresh as /eventos
export const revalidate = 3600;

export async function GET() {
  const events = (await getFeedEvents()).map((event) => ({
    ...event,
    url: new URL(event.url, SITE_URL).toString(),
  }));
  const body = buildIcs(
    events.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.venue,
      url: event.url,
      description: `Organiza: ${event.group}\n${event.url}`,
      cancelled: event.cancelled,
    })),
    {
      name: "OWU · Eventos tech en Uruguay",
      description: "Meetups, talleres y conferencias de las comunidades de OWU. owu.uy/eventos",
    }
  );

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="owu-eventos.ics"',
    },
  });
}
