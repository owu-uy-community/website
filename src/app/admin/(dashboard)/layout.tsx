import type React from "react";

import { AdminShell } from "components/Admin/shell/AdminShell";

// Every page here is behind a session and reads the working scope from the
// URL, so there is nothing worth prerendering — and prerendering the shell
// would fail on the client-side `useSearchParams` it depends on.
export const dynamic = "force-dynamic";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
