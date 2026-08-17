import { requireAdmin } from "app/lib/auth-helpers";

import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  await requireAdmin();

  return <SettingsClient />;
}
