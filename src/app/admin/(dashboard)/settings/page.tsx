import { requireAdmin } from "app/lib/auth-helpers";

import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const session = await requireAdmin();
  const { name, email, image } = session.user;

  // The account comes from the server's session: the page renders the same on both sides.
  return <SettingsClient user={{ name, email, image: image ?? null }} />;
}
