import type React from "react";

import { AdminShell } from "components/Admin/shell/AdminShell";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
