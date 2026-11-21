import { notFound } from "next/navigation";

import { ScreenBeacon } from "components/Admin/screens/ScreenBeacon";
import MapKioskClient from "components/displays/MapKioskClient";
import { getEventBySlugs } from "lib/tenant-server";

// A live screen at the venue: rendered per request, allowed to block (Cache Components)
export const instant = false;

export default async function EventKioskMapPage({
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
      <MapKioskClient eventId={resolved.event.id} />
    </>
  );
}
