import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

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
  // Per request, never prerendered: reading the link checks its expiry against the clock
  await connection();
  const { token } = await params;
  // A link that expired or was revoked says so; anything else is ours, and trying again may work
  const outcome = await publicCaller.door.info({ token }).then(
    (info) => ({ info, problem: null }),
    (error: { code?: string }) => ({ info: null, problem: error.code === "NOT_FOUND" ? "expired" : "failed" })
  );

  return (
    <div className="min-h-svh bg-app text-foreground" data-admin-shell="">
      {outcome.info ? (
        <DoorClient info={outcome.info} token={token} />
      ) : (
        <main className="mx-auto max-w-md px-4 py-16">
          <Panel>
            {outcome.problem === "expired" ? (
              <EmptyState
                description="Este link venció o lo anularon. Pedile uno nuevo a quien organiza."
                title="Este link de la puerta ya no sirve"
              />
            ) : (
              <EmptyState
                action={
                  <a
                    className="inline-flex h-9 items-center rounded-md border border-input px-3 text-ui text-foreground hover:bg-raised"
                    href={`/puerta/${token}`}
                  >
                    Probar de nuevo
                  </a>
                }
                description="Puede ser la conexión o algo de nuestro lado. El link sigue sirviendo."
                title="No pudimos cargar. Probá de nuevo"
              />
            )}
          </Panel>
        </main>
      )}
    </div>
  );
}
