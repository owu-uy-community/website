import { notFound } from "next/navigation";

import { ScreenBeacon } from "components/Admin/screens/ScreenBeacon";
import CountdownDisplayClient from "components/displays/countdown/CountdownDisplayClient";
import { getEventBySlugs } from "lib/tenant-server";

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
