import { notFound } from "next/navigation";

import MapKioskClient from "components/displays/MapKioskClient";
import { getEventBySlugs } from "lib/tenant-server";

export default async function EventKioskMapPage({
  params,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
}) {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) notFound();

  return <MapKioskClient eventId={resolved.event.id} />;
}
