import { requireAdmin } from "app/lib/auth-helpers";

import LaunchpadClient from "./LaunchpadClient";

export default async function LaunchpadPage() {
  await requireAdmin();

  return <LaunchpadClient />;
}
