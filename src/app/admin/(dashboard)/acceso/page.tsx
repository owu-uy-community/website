import type { Metadata } from "next";

import { requirePermission } from "app/lib/auth-helpers";
import { AccessClient } from "components/Admin/access/AccessClient";

export const metadata: Metadata = { title: "Acceso" };

/** People and roles, the waitlist, invitations, API keys and the audit log. Moderators, staff and superadmins. */
export default async function AccesoPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("claim:read");
  const { tab } = await searchParams;

  return <AccessClient initialTab={tab ?? ""} />;
}
