import { redirect } from "next/navigation";

import { requireDashboardAccess } from "app/lib/auth-helpers";
import { caller } from "lib/orpc/server";

/**
 * Per-event pages live under /admin/<community>/…; their bare paths (an old bookmark, or a nav
 * link clicked before the event list loaded) forward to the newest event the user can operate,
 * keeping `?event=` when it was given.
 */
export async function redirectToEventPage(page: string, eventSlug: string | undefined) {
  await requireDashboardAccess();
  const events = await caller.openSpaces.listForAdmin();
  const selected = (eventSlug ? events.find((event) => event.slug === eventSlug) : events[0]) ?? events[0];
  if (!selected) redirect("/admin");

  redirect(`/admin/${selected.communitySlug}/${page}?event=${encodeURIComponent(selected.slug)}`);
}
