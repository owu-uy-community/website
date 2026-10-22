import { requirePermission } from "app/lib/auth-helpers";

import LaunchpadClient from "./LaunchpadClient";

export default async function LaunchpadPage() {
  await requirePermission("obs:read");

  return <LaunchpadClient />;
}
