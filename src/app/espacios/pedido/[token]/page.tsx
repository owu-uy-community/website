import type { Metadata } from "next";

import { HostResponse } from "components/organizar/venues/HostResponse";
import { HostShell, LinkTrouble } from "components/organizar/venues/HostShell";
import { publicCaller } from "lib/orpc/server";

// The token is the only key: never cached (nothing here says "use cache"), never indexed, never sent on
// as a referrer. Rendered per request, allowed to block (Cache Components).
export const instant = false;
export const metadata: Metadata = {
  title: "Pedido de espacio · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Where a host answers a community's request, from the emailed link, without an account. */
export default async function HostRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // A bad or lapsed link is NOT_FOUND; anything else is us failing to load, said differently
  const result = await publicCaller.venues.byToken({ token }).then(
    (view) => ({ view, failed: false }),
    (error: { code?: string }) => ({ view: null, failed: error.code !== "NOT_FOUND" })
  );

  return (
    <HostShell label="Pedido de espacio">
      {result.view ? (
        <HostResponse token={token} view={result.view} />
      ) : (
        <LinkTrouble failed={result.failed} retry={`/espacios/pedido/${token}`} />
      )}
    </HostShell>
  );
}
