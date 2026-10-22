import { redirect } from "next/navigation";

import { isSiteAdmin, requireStaffSession } from "app/lib/auth-helpers";
import { caller } from "lib/orpc/server";

/**
 * The admin's front door: site staff land on the newest event's Hoy, community staff on their
 * own day (Mi turno) in the newest event they work on.
 */
export default async function AdminHomePage() {
  const session = await requireStaffSession();
  const events = await caller.openSpaces.listForAdmin();
  const newest = events[0];

  if (!newest) redirect(isSiteAdmin(session) ? "/admin/communities" : "/");

  const page = isSiteAdmin(session) ? "" : "/mi-turno";
  redirect(`/admin/${newest.communitySlug}${page}?event=${encodeURIComponent(newest.slug)}`);
}
