import { getUpcomingEvents } from "lib/community/events";
import { buildIcs } from "lib/community/ics";

// Calendar apps poll this; it follows the same hourly refresh as /eventos
export const revalidate = 3600;

export async function GET() {
  const events = await getUpcomingEvents();
  const body = buildIcs(
    events.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.venue,
      url: event.url,
      description: `Organiza: ${event.group}\n${event.url}`,
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
