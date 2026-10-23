import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { signInAgain } from "app/lib/auth-helpers";
import { TicketView } from "components/community/event/TicketView";
import { SiteChrome } from "components/community/SiteChrome";
import { callerFor, publicCaller } from "lib/orpc/server";

// The visitor's own ticket: rendered per request, allowed to block (Cache Components)
export const instant = false;
export const metadata: Metadata = {
  title: "Tu entrada · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Someone's ticket: from the emails' signed link (?t=) or, signed in, their own. The QR is what
 * the door scans; "No puedo ir" frees the seat for the next person. The reminder's links add
 * `accion=confirmar|liberar`: the page asks once more, and only its button changes anything.
 */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
  searchParams: Promise<{ t?: string; accion?: string }>;
}) {
  // Per request, never prerendered: reading a signed link checks its expiry against the clock
  await connection();
  const [{ communitySlug, eventSlug }, { t, accion }] = await Promise.all([params, searchParams]);
  const requestHeaders = await headers();
  let ticket = t ? await publicCaller.rsvps.ticket({ token: t }).catch(() => null) : null;
  if (!t) {
    const event = await publicCaller.events.public({ communitySlug, eventSlug }).catch(() => null);
    if (!event) notFound();
    ticket = await callerFor(requestHeaders)
      .rsvps.myTicket({ eventId: event.id })
      .catch((error: { code?: string }) => {
        if (error.code === "UNAUTHORIZED")
          return signInAgain(`/comunidad/${communitySlug}/events/${eventSlug}/entrada`);
        return null;
      });
  }
  // A link for another event's ticket opens nothing here
  if (ticket && ticket.event.slug !== eventSlug) notFound();
  const action = accion === "confirmar" || accion === "liberar" ? accion : undefined;

  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-md px-5 pt-10 pb-24">
        {ticket ? (
          <TicketView action={action} ticket={ticket} />
        ) : (
          <div className="rounded-2xl border border-white/10 p-6 text-center text-zinc-300">
            <p>
              {t
                ? "Este link venció o ya no sirve. Tu entrada está en Mis eventos, entrando con tu cuenta."
                : "No encontramos una entrada tuya para este evento."}
            </p>
            <p className="mt-3 flex justify-center gap-4">
              {t ? (
                <Link className="text-yellow-400 underline underline-offset-4" href="/mis-eventos">
                  Mis eventos
                </Link>
              ) : null}
              <Link
                className="text-yellow-400 underline underline-offset-4"
                href={`/comunidad/${communitySlug}/events/${eventSlug}`}
              >
                Ir al evento
              </Link>
            </p>
          </div>
        )}
      </main>
    </SiteChrome>
  );
}
