import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { requirePermission } from "app/lib/auth-helpers";
import { Scanner } from "components/Admin/attendees/Scanner";
import { db } from "lib/db";
import { events } from "lib/db/schema";

import { resolveAdminCommunityScope } from "../../scope";

/** OWU's own door scanner (beta), for when Eventbrite Organizer isn't an option. Site staff only. */
export default async function ScannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  await requirePermission("raffle:read");

  const { communitySlug } = await params;
  const { event: eventSlug } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, "raffle:read");
  if (!scope?.selected) notFound();

  const selected = scope.selected;
  const [event] = await db.select({ timezone: events.timezone }).from(events).where(eq(events.id, selected.id));
  if (!event) notFound();

  return (
    <Scanner
      backHref={`/admin/${scope.community.slug}/attendees?event=${encodeURIComponent(selected.slug)}`}
      eventId={selected.id}
      eventName={selected.name}
      timezone={event.timezone}
    />
  );
}
