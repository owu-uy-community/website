import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SiteChrome } from "components/community/SiteChrome";
import { CONDUCT_EMAIL } from "lib/community/site";
import { shortWhen } from "lib/community/time";
import { publicCaller } from "lib/orpc/server";

import { ReportForm } from "./ReportForm";

type Params = Promise<{ communitySlug: string; eventSlug: string }>;

// A form for one event: rendered per request, allowed to block (Cache Components)
export const instant = false;
export const metadata: Metadata = {
  title: "Reportar un problema · OWU",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Report a problem at an event, anonymously if wanted. It goes to the event's code-of-conduct
 * responders and to OWU's conduct team; to OWU only when it involves someone of the organization.
 */
export default async function ReportPage({ params }: { params: Params }) {
  const { communitySlug, eventSlug } = await params;
  // Always the event as it is now (cancelled, past): read at request time
  await connection();
  const event = await publicCaller.events.public({ communitySlug, eventSlug }).catch(() => null);
  if (!event) notFound();
  const names = new Intl.ListFormat("es", { type: "conjunction" }).format(event.responders);

  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-xl px-5 pt-10 pb-24 text-zinc-100">
        <nav aria-label="Ruta" className="mb-6 text-[13px] text-zinc-400">
          <Link className="hover:text-zinc-300" href={`/comunidad/${communitySlug}/events/${eventSlug}`}>
            {event.name}
          </Link>
        </nav>
        <h1 className="font-title text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
          Reportar un problema
        </h1>
        <p className="mt-3 text-[15px] text-zinc-400">
          {`${event.name} · ${event.community.name} · ${shortWhen(event.startDate)}`}
        </p>
        <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] leading-relaxed text-zinc-300">
          <p>
            Si alguien te hizo sentir incómodo, inseguro o fuera de lugar, o viste algo que no está bien, contanos. Lo
            leen {event.responders.length > 0 ? `${names}, que responden por la conducta en este evento, y ` : ""}
            el equipo de conducta de OWU ({CONDUCT_EMAIL}). Nadie más.
          </p>
          <p>
            <strong className="font-semibold text-white">Qué pasa después:</strong> si el evento está en curso, te
            responden en medio día; si ya pasó, en 7 días. Si dejás un contacto, te cuentan qué hicieron.
          </p>
          <p className="text-zinc-400">
            Si hay un riesgo ahora, hablá con alguien de la organización en el lugar o llamá al 911.
          </p>
        </div>
        <ReportForm communitySlug={communitySlug} eventSlug={eventSlug} />
      </main>
    </SiteChrome>
  );
}
