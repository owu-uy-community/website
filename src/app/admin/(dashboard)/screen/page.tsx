import { requirePermission } from "app/lib/auth-helpers";

import ScreenClient from "./ScreenClient";

export default async function ScreenPage() {
  await requirePermission("obs:read");

  return <ScreenClient />;
}
