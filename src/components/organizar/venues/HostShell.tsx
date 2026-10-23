import type { ReactNode } from "react";
import Image from "next/image";
import { Link2Off, RefreshCw, TriangleAlert } from "lucide-react";

import { MicroLabel, Panel } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { buttonVariants } from "components/shared/ui/button";

/** The frame of the pages a space's contact opens from an email (a request, the yearly check). */
export function HostShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-app bg-grain text-foreground" data-admin-shell="">
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-8 sm:py-14">
        <header className="flex items-center gap-3">
          <Image alt="OWU" className="size-9 rounded-lg" height={36} src="/images/logos/owu.webp" width={36} />
          <div>
            <MicroLabel>{label}</MicroLabel>
            <p className="text-meta text-muted-foreground">Comunidades tecnológicas de Uruguay</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

/** A link that doesn't open: lapsed or broken (ask for another), or our failure (try again). */
export function LinkTrouble({ failed, retry }: { failed: boolean; retry: string }) {
  return (
    <Panel>
      {failed ? (
        <EmptyState
          action={
            <a className={buttonVariants({ variant: "outline", size: "sm" })} href={retry}>
              <RefreshCw />
              Probá de nuevo
            </a>
          }
          description="Fue un problema nuestro, no del link. Probá de nuevo en un rato."
          icon={TriangleAlert}
          title="No pudimos cargar"
        />
      ) : (
        <EmptyState
          description="Venció o está incompleto. Pedile a quien te escribió que te lo reenvíe."
          icon={Link2Off}
          title="Este link ya no sirve"
        />
      )}
    </Panel>
  );
}
