import { notFound, redirect } from "next/navigation";

import { getEventBySlugs } from "lib/tenant-server";

/**
 * Short shareable URL for an event: `/comunidad/owu/la-meetup-2025` lands on its page (which
 * sends open-space boards to their agenda). Anything that is not an event slug 404s.
 */
// A short link that redirects to the event: rendered per request, allowed to block (Cache Components)
export const instant = false;

export default async function EventShortcutPage({
  params,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
}) {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) notFound();

  redirect(`/comunidad/${communitySlug}/events/${eventSlug}`);
}
