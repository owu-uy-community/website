import { notFound, redirect } from "next/navigation";

import { getEventBySlugs } from "lib/tenant-server";

/**
 * Short shareable URL for an event: `/comunidad/owu/la-meetup-2025` lands on its
 * agenda. Anything that is not an event slug 404s rather than guessing.
 */
export default async function EventShortcutPage({
  params,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
}) {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) notFound();

  redirect(`/comunidad/${communitySlug}/events/${eventSlug}/openspace`);
}
