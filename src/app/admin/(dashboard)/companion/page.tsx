import { requirePermission } from "app/lib/auth-helpers";
import CompanionControl from "components/Companion/CompanionControl";

/** «Ajustes de Owy»: every setting of the physical Owys and the bridge. The day's buttons are on /admin/owy. */
export default async function CompanionPage() {
  await requirePermission("stage:read");

  return <CompanionControl />;
}
