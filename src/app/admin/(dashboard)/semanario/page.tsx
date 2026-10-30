import { requirePermission } from "app/lib/auth-helpers";

import SemanarioClient from "./SemanarioClient";

export default async function SemanarioAdminPage() {
  await requirePermission("semanario:read");

  return <SemanarioClient />;
}
