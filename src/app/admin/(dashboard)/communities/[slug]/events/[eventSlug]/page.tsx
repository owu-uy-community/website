import { requireAdmin } from "app/lib/auth-helpers";

import EventDetailClient from "./EventDetailClient";

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string; eventSlug: string }> }) {
  await requireAdmin();
  const { slug, eventSlug } = await params;

  return <EventDetailClient communitySlug={slug} eventSlug={eventSlug} />;
}
