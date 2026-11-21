import type React from "react";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { PanelShell } from "components/organizar/shell/PanelShell";
import { AppProviders } from "components/providers/AppProviders";

import { panelAccess } from "./access";

// Behind a session, and every page reads who is looking: rendered per request, allowed to block
// (Cache Components).
export const instant = false;

export const metadata: Metadata = {
  title: "Organizá · OWU",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0b0b0b" };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { communities, isStaff } = await panelAccess();
  const jar = await cookies();
  const sidebar = jar.get("sidebar:state")?.value;

  return (
    <AppProviders>
      <PanelShell communities={communities} defaultOpen={sidebar ? sidebar !== "false" : true} isStaff={isStaff}>
        {children}
      </PanelShell>
    </AppProviders>
  );
}
