import { notFound } from "next/navigation";

import { requireAdmin } from "app/lib/auth-helpers";
import { caller } from "lib/orpc/server";

import { resolveAdminCommunityScope } from "../../../../[communitySlug]/scope";
import EventDetailClient from "./EventDetailClient";

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string; eventSlug: string }> }) {
  await requireAdmin();
  const { slug, eventSlug } = await params;

  const scope = await resolveAdminCommunityScope(slug, eventSlug, null);
  const option = scope?.events.find((event) => event.slug === eventSlug);
  if (!scope || !option) notFound();

  const event = await caller.openSpaces.get({ id: option.id });

  // Keyed by the event: a link to another event never carries this one's edits over.
  return <EventDetailClient key={event.id} community={scope.community} initialEvent={event} />;
}
