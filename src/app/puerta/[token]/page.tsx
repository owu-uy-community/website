import type { Metadata, Viewport } from "next";

import { Panel } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { DoorClient } from "components/organizar/door/DoorClient";
import { publicCaller } from "lib/orpc/server";

// A door link's own check-in list: rendered per request, allowed to block (Cache Components)
export const instant = false;
export const metadata: Metadata = {
  title: "Puerta · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0b0b0b" };

/** The volunteers' door, from the link an organizer handed out: the scanner, no account, no sidebar. */
export default async function DoorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await publicCaller.door.info({ token }).catch(() => null);

  return (
    <div className="min-h-svh bg-app text-foreground" data-admin-shell="">
      {info ? (
        <DoorClient info={info} token={token} />
      ) : (
        <main className="mx-auto max-w-md px-4 py-16">
          <Panel>
            <EmptyState
              description="Venció o lo anularon. Pedile uno nuevo a quien organiza."
              title="Este link de la puerta ya no sirve"
            />
          </Panel>
        </main>
      )}
    </div>
  );
}
