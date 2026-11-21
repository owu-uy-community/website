import { notFound } from "next/navigation";

import { ScreenBeacon } from "components/Admin/screens/ScreenBeacon";
import CountdownDisplayClient from "components/displays/countdown/CountdownDisplayClient";
import { getEventBySlugs } from "lib/tenant-server";

// A live screen that follows the admin: rendered per request, allowed to block (Cache Components)
export const instant = false;

export default async function EventCountdownPage({
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
      <CountdownDisplayClient eventId={resolved.event.id} />
    </>
  );
}
