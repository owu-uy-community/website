import { CARD_SIZES, renderCover } from "lib/og/cover";
import { callerFor } from "lib/orpc/server";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Share cards to download and post: an event's or a talk's, square (1080×1080) or story
 * (1080×1920), on OWU's cover. A published event's are anyone's; a draft's only its organizers'
 * (talks.card checks who's asking).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string; format: string }> }
) {
  const { kind, id, format } = await params;
  const size = Object.hasOwn(CARD_SIZES, format) ? CARD_SIZES[format as keyof typeof CARD_SIZES] : null;
  if (!size || (kind !== "evento" && kind !== "charla")) return notFound();
  const card = await callerFor(request.headers)
    .talks.card({ kind, id })
    .catch(() => null);
  if (!card) return notFound();

  const image = await renderCover({
    tag: card.tag,
    title: card.title,
    subtitle: card.subtitle,
    footerLabel: card.footerLabel,
    footer: card.footer,
    chips: card.chips,
    size,
  });

  return new Response(image.body, {
    headers: {
      "Content-Type": "image/png",
      // A draft's card is for its organizers: never in a shared cache
      "Cache-Control": card.public ? "public, max-age=300" : "private, no-store",
      "Content-Disposition": `inline; filename="${kind}-${format}.png"`,
    },
  });
}
