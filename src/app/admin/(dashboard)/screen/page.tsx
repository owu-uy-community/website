import { requireAdmin } from "app/lib/auth-helpers";

import ScreenClient from "./ScreenClient";

export default async function ScreenPage() {
  await requireAdmin();

  return <ScreenClient />;
}
