import { redirect } from "next/navigation";

import { requireAdmin } from "app/lib/auth-helpers";
import { listEventsForOperator } from "lib/orpc/open-spaces/services/get-all";

/** Legacy URL: attendees now live under /admin/<communitySlug>/attendees. */
export default async function AttendeesLegacyPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  await requireAdmin();

  const { event: eventSlug } = await searchParams;
  const events = await listEventsForOperator(null);
  const selected = (eventSlug ? events.find((event) => event.slug === eventSlug) : events[0]) ?? events[0];
  if (!selected) redirect("/admin/communities");

  redirect(`/admin/${selected.communitySlug}/attendees?event=${encodeURIComponent(selected.slug)}`);
}
