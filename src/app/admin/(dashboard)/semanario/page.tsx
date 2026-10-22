import { requireAdmin } from "app/lib/auth-helpers";

import SemanarioClient from "./SemanarioClient";

export default async function SemanarioAdminPage() {
  await requireAdmin();

  return <SemanarioClient />;
}
