import type { Metadata } from "next";
import Image from "next/image";

import { MicroLabel, Panel } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { HostResponse } from "components/organizar/venues/HostResponse";
import { publicCaller } from "lib/orpc/server";

// The token is the only key: never cached, never indexed, never sent on as a referrer.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pedido de espacio · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Where a host answers a community's request, from the emailed link, without an account. */
export default async function HostRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await publicCaller.venues.byToken({ token }).catch(() => null);

  return (
    <div className="min-h-svh bg-app bg-grain text-foreground" data-admin-shell="">
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-8 sm:py-14">
        <header className="flex items-center gap-3">
          <Image alt="OWU" className="size-9 rounded-lg" height={36} src="/images/logos/owu.webp" width={36} />
          <div>
            <MicroLabel>Pedido de espacio</MicroLabel>
            <p className="text-meta text-muted-foreground">Comunidades tecnológicas de Uruguay</p>
          </div>
        </header>
        {view ? (
          <HostResponse token={token} view={view} />
        ) : (
          <Panel>
            <EmptyState
              description="Puede que el link esté incompleto. Pedile a la comunidad que te lo reenvíe."
              title="No encontramos este pedido"
            />
          </Panel>
        )}
      </main>
    </div>
  );
}
