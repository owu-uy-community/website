import { notFound } from "next/navigation";

import { ScreenBeacon } from "components/Admin/screens/ScreenBeacon";
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

  return (
    <>
      <ScreenBeacon eventId={resolved.event.id} />
      <StickyNoteDisplay eventId={resolved.event.id} />
    </>
  );
}
