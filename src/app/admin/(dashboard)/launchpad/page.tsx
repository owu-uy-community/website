import { requirePermission } from "app/lib/auth-helpers";

import LaunchpadClient from "./LaunchpadClient";

// Per request, allowed to block (Cache Components): the admin layout's own setting doesn't carry down
export const instant = false;

export default async function LaunchpadPage() {
  await requirePermission("obs:read");

  return <LaunchpadClient />;
}
