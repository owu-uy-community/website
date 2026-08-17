import { requireAdmin } from "app/lib/auth-helpers";
import DashboardClient from "./DashboardClient";

export default async function AdminDashboardPage() {
  // Validate admin access
  await requireAdmin();

  return <DashboardClient />;
}
