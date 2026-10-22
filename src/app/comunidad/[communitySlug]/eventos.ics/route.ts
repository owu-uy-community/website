import { getFeedEvents } from "lib/community/events";
import { buildIcs } from "lib/community/ics";
import { SITE_URL } from "lib/community/site";
import { getCommunityBySlug } from "lib/tenant-server";

// Calendar apps poll this; the same hourly refresh as the agenda
export const revalidate = 3600;

/** One community's upcoming events as a calendar to subscribe to (OWU's and its Meetup ones). */
export async function GET(_request: Request, { params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const community = await getCommunityBySlug(communitySlug);
  if (!community?.isActive) return new Response("Not found", { status: 404 });

  const mine = (await getFeedEvents()).filter((event) => event.communitySlug === community.slug);
  const body = buildIcs(
    mine.map((event) => {
      const url = new URL(event.url, SITE_URL).toString();

      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        location: event.venue,
        url,
        description: `Organiza: ${event.group}\n${url}`,
        cancelled: event.cancelled,
      };
    }),
    {
      name: `${community.name} · OWU`,
      description: `Los eventos de ${community.name}. owu.uy/comunidad/${community.slug}`,
    }
  );

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${community.slug}.ics"`,
    },
  });
}
