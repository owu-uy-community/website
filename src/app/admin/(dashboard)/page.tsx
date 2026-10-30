import { redirect } from "next/navigation";

import { hasPermission, requireDashboardAccess } from "app/lib/auth-helpers";
import { caller } from "lib/orpc/server";

/**
 * The admin's front door: site staff land on the newest event's Hoy, community staff on their
 * own day (Mi turno) in the newest event they work on, people managers on Acceso. Anyone without
 * access was already sent to ask for it.
 */
export default async function AdminHomePage() {
  await requireDashboardAccess();
  const [siteStaff, peopleManager] = await Promise.all([hasPermission("event:manage"), hasPermission("claim:read")]);
  const events = await caller.openSpaces.listForAdmin();
  const newest = events[0];

  if (!newest) redirect(siteStaff ? "/admin/communities" : peopleManager ? "/admin/acceso" : "/");

  const page = siteStaff ? "" : "/mi-turno";
  redirect(`/admin/${newest.communitySlug}${page}?event=${encodeURIComponent(newest.slug)}`);
}
