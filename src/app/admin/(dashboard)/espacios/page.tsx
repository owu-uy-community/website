import { requirePermission } from "app/lib/auth-helpers";

import { VenuesAdminClient } from "./VenuesAdminClient";

export default async function VenuesAdminPage() {
  await requirePermission("venue:manage");

  return <VenuesAdminClient />;
}
