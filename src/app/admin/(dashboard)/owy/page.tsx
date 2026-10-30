import { redirect } from "next/navigation";

import { requirePermission } from "app/lib/auth-helpers";

/** Bare /admin/owy would otherwise fall into the [communitySlug] catch-all. */
export default async function OwyAdminIndex() {
  await requirePermission("stage:read");
  redirect("/admin/owy/scenes");
}
