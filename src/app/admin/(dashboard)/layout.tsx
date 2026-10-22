import type React from "react";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { AdminShell } from "components/Admin/shell/AdminShell";
import { URGENT_COOKIE } from "components/Admin/shell/nav-config";

// Every page here is behind a session and reads the working scope from the
// URL, so there is nothing worth prerendering — and prerendering the shell
// would fail on the client-side `useSearchParams` it depends on.
export const dynamic = "force-dynamic";

/**
 * The admin installs as its own app, "OWU Ops" (home screen on iOS and Android, a window on a
 * desktop). Installed, it runs edge to edge under a translucent status bar: the shell's header,
 * tab bar and sheets pad themselves with the safe-area insets. The scenes desk sets its own.
 */
export const metadata: Metadata = {
  manifest: "/owu-ops.webmanifest",
  appleWebApp: { capable: true, title: "OWU Ops", statusBarStyle: "black-translucent" },
  icons: { apple: "/owu-ops-apple-touch-icon.png" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0b0b0b",
};

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  // The sidebar writes the operator's open/closed choice to this cookie; read it so a reload keeps
  // it. Without one, the shell's guess for this window (sidebar:auto) stands in.
  const sidebar = jar.get("sidebar:state")?.value;
  const open = sidebar ? sidebar !== "false" : jar.get("sidebar:auto")?.value !== "folded";

  return (
    <AdminShell
      defaultOpen={open}
      sidebarChosen={sidebar !== undefined}
      urgentHint={jar.get(URGENT_COOKIE)?.value === "1"}
    >
      {children}
    </AdminShell>
  );
}
