import { requirePermission } from "app/lib/auth-helpers";

import CommunitiesClient from "./CommunitiesClient";

// Per request, allowed to block (Cache Components): the admin layout's own setting doesn't carry down
export const instant = false;

export default async function CommunitiesPage() {
  await requirePermission("organization:list");

  return <CommunitiesClient />;
}
