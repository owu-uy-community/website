import type React from "react";

import { requireDashboardAccess } from "app/lib/auth-helpers";

/**
 * Pass-through for the chrome (it lives in (dashboard)/layout.tsx so a fullscreen admin surface can
 * opt out of it by sitting outside that group), and the admin's default deny: only people with a
 * platform or community role get past here. Each page still checks its own permission.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess();

  return children;
}
