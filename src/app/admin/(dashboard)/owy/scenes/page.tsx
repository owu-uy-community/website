import type { Metadata, Viewport } from "next";

import { requirePermission } from "app/lib/auth-helpers";

import ScenesClient from "./ScenesClient";

/**
 * "Agregar a pantalla de inicio" turns the desk into an app: no browser bars
 * on the phone (Safari has no fullscreen for pages), edge to edge with the
 * safe areas handled by the layout.
 */
export const metadata: Metadata = {
  title: "Escenas Owy",
  manifest: "/owy-desk.webmanifest",
  appleWebApp: { capable: true, title: "Escenas", statusBarStyle: "black" },
  icons: { apple: "/owy-desk-icon-180.png" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0b0b0d",
};

export default async function OwyScenesPage() {
  await requirePermission("stage:read");

  return <ScenesClient />;
}
