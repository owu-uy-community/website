import type { Metadata } from "next";

import { HostCheck } from "components/organizar/venues/HostCheck";
import { HostShell, LinkTrouble } from "components/organizar/venues/HostShell";
import { publicCaller } from "lib/orpc/server";

// Like the request page: the token is the only key, never cached, indexed or sent on as a referrer
export const instant = false;
export const metadata: Metadata = {
  title: "¿Siguen recibiendo meetups? · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The yearly check a space's contact opens from the email. Opening it changes nothing; each answer is a POST. */
export default async function HostCheckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await publicCaller.venues.checkByToken({ token }).then(
    (view) => ({ view, failed: false }),
    (error: { code?: string }) => ({ view: null, failed: error.code !== "NOT_FOUND" })
  );

  return (
    <HostShell label="Espacios de OWU">
      {result.view ? (
        <HostCheck token={token} view={result.view} />
      ) : (
        <LinkTrouble failed={result.failed} retry={`/espacios/seguimos/${token}`} />
      )}
    </HostShell>
  );
}
