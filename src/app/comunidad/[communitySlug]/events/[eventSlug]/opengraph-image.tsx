import { shortWhen } from "lib/community/time";
import { topicLabel } from "lib/community/topics";
import { COVER_SIZE, renderCover, topicChip } from "lib/og/cover";
import { publicCaller } from "lib/orpc/server";

export const size = COVER_SIZE;
export const contentType = "image/png";
export const alt = "El evento en owu.uy";

/** The event's share image: its community, name, date and place, on OWU's cover. */
export default async function EventCover({
  params,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
}) {
  const { communitySlug, eventSlug } = await params;
  const event = await publicCaller.events.public({ communitySlug, eventSlug }).catch(() => null);
  if (!event) return new Response("Not found", { status: 404 });

  const where = event.mode === "online" ? "Online" : (event.place?.name ?? "Lugar a confirmar");

  return renderCover({
    tag: event.community.name,
    title: event.name,
    footerLabel: event.status === "cancelled" ? "Cancelado" : shortWhen(event.startDate),
    footer: event.mode === "hibrido" ? `${where} y online` : where,
    chips: event.topics.map((topic) => topicChip(topicLabel(topic))),
    dimmed: event.status === "cancelled",
  });
}
