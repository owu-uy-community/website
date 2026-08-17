import { notFound, redirect } from "next/navigation";

import { getEventBySlugs } from "lib/tenant-server";

/**
 * Event root: the agenda IS the event page, so the bare URL forwards to it
 * instead of 404ing when someone trims the path.
 */
export default async function EventRootPage({
  params,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
}) {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) notFound();

  redirect(`/comunidad/${communitySlug}/events/${eventSlug}/openspace`);
}
