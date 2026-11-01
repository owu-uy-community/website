import { requirePermission } from "app/lib/auth-helpers";
import { CompanionTabs } from "components/Companion/control/CompanionTabs";

/** The physical Owys: «Control» (the devices and the bridge) and «Laboratorio» (?tab=lab). */
export default async function CompanionPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("stage:read");
  const { tab } = await searchParams;

  return <CompanionTabs initialTab={tab === "lab" ? "lab" : "control"} />;
}
