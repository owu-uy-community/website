import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { TicketView } from "components/community/event/TicketView";
import { SiteChrome } from "components/community/SiteChrome";
import { callerFor, publicCaller } from "lib/orpc/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tu entrada · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Someone's ticket: from the emails' signed link (?t=) or, signed in, their own. The QR is what
 * the door scans; "No puedo ir" frees the seat for the next person.
 */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ communitySlug, eventSlug }, { t }] = await Promise.all([params, searchParams]);
  const requestHeaders = await headers();
  let ticket = t ? await publicCaller.rsvps.ticket({ token: t }).catch(() => null) : null;
  if (!t) {
    const event = await publicCaller.events.public({ communitySlug, eventSlug }).catch(() => null);
    if (!event) notFound();
    ticket = await callerFor(requestHeaders)
      .rsvps.myTicket({ eventId: event.id })
      .catch((error: { code?: string }) => {
        if (error.code === "UNAUTHORIZED")
          redirect(`/login?next=/comunidad/${communitySlug}/events/${eventSlug}/entrada`);
        return null;
      });
  }
  if (ticket && ticket.event.slug !== eventSlug) notFound();

  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-md px-5 pt-10 pb-24">
        {ticket ? (
          <TicketView ticket={ticket} />
        ) : (
          <div className="rounded-2xl border border-white/10 p-6 text-center text-zinc-300">
            <p>No encontramos una entrada tuya para este evento.</p>
            <Link
              className="mt-3 inline-block text-yellow-400 underline underline-offset-4"
              href={`/comunidad/${communitySlug}/events/${eventSlug}`}
            >
              Ir al evento
            </Link>
          </div>
        )}
      </main>
    </SiteChrome>
  );
}
