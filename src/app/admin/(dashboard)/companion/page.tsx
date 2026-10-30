import { requirePermission } from "app/lib/auth-helpers";
import CompanionWorkbench from "components/Companion/CompanionWorkbench";

export default async function CompanionPage() {
  await requirePermission("stage:read");
  return <CompanionWorkbench />;
}
