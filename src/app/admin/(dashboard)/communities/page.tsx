import { requireAdmin } from "app/lib/auth-helpers";

import CommunitiesClient from "./CommunitiesClient";

export default async function CommunitiesPage() {
  await requireAdmin();

  return <CommunitiesClient />;
}
