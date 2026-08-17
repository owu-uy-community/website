import { redirect } from "next/navigation";

import { requireAdmin } from "app/lib/auth-helpers";
import { listEventsForOperator } from "lib/orpc/open-spaces/services/get-all";

/**
 * Legacy URL: the board now lives under /admin/<communitySlug>/openspace.
 * Resolve which community `?event=` (or the newest event) belongs to and
 * forward there, keeping the selection.
 */
export default async function OpenSpaceLegacyPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  await requireAdmin();

  const { event: eventSlug } = await searchParams;
  const events = await listEventsForOperator(null);
  const selected = (eventSlug ? events.find((event) => event.slug === eventSlug) : events[0]) ?? events[0];
  if (!selected) redirect("/admin/communities");

  redirect(`/admin/${selected.communitySlug}/openspace?event=${encodeURIComponent(selected.slug)}`);
}
