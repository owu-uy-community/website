import type { Metadata, Viewport } from "next";

import { requirePermission } from "app/lib/auth-helpers";
import { OwyOps } from "components/Admin/owy/OwyOps";

/** The day's page for Owy and the open space; on the phone, «Agregar a pantalla de inicio» makes it the remote. */
export const metadata: Metadata = {
  title: "Owy",
  manifest: "/owy-ops.webmanifest",
  appleWebApp: { capable: true, title: "Owy", statusBarStyle: "black" },
  icons: { apple: "/owy-desk-icon-180.png" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0b0b0d",
};

export default async function OwyOpsPage() {
  await requirePermission("stage:read");

  return <OwyOps />;
}
