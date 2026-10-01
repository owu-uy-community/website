import { requireAdmin } from "app/lib/auth-helpers";

import ScenesClient from "./ScenesClient";

export default async function OwyScenesPage() {
  await requireAdmin();

  return <ScenesClient />;
}
