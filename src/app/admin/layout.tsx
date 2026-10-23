import type React from "react";

import { requireDashboardAccess } from "app/lib/auth-helpers";
import { AppProviders } from "components/providers/AppProviders";

// Behind a session and the working scope in the URL: every admin page renders per request and
// may block (Cache Components). The permission check below reads the session cookie first.
export const instant = false;

/**
 * Pass-through for the chrome (it lives in (dashboard)/layout.tsx so a fullscreen admin surface can
 * opt out of it by sitting outside that group), and the admin's default deny: only people with a
 * platform or community role get past here. Each page still checks its own permission.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess();

  return <AppProviders>{children}</AppProviders>;
}
