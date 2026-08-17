import { notFound } from "next/navigation";

import StickyNoteDisplay from "components/displays/StickyNoteDisplay";
import { getEventBySlugs } from "lib/tenant-server";

export default async function EventStickyNotePage({
  params,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
}) {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) notFound();

  return <StickyNoteDisplay eventId={resolved.event.id} />;
}
