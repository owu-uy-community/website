import type { Metadata, Viewport } from "next";

import { requirePermission } from "app/lib/auth-helpers";
import { TalkConsole } from "components/Admin/talk/Console";

/** The presenter's console for «Owy, en vivo»; on the phone, «Agregar a pantalla de inicio» makes it the remote. */
export const metadata: Metadata = {
  title: "Charla Owy",
  manifest: "/owy-charla.webmanifest",
  appleWebApp: { capable: true, title: "Charla", statusBarStyle: "black" },
  icons: { apple: "/owy-desk-icon-180.png" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0b0b0d",
};

export default async function TalkConsolePage() {
  await requirePermission("stage:operate");

  return <TalkConsole />;
}
