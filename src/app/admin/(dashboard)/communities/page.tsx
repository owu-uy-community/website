import { requirePermission } from "app/lib/auth-helpers";

import CommunitiesClient from "./CommunitiesClient";

export default async function CommunitiesPage() {
  await requirePermission("organization:list");

  return <CommunitiesClient />;
}
