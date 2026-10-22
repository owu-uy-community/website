import { requireAdmin } from "app/lib/auth-helpers";

import { VenuesAdminClient } from "./VenuesAdminClient";

export default async function VenuesAdminPage() {
  await requireAdmin();

  return <VenuesAdminClient />;
}
