import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import type { PublicEvent } from "lib/orpc/events/schemas";

/** Where a report about the event goes: its responders and OWU's conduct team. */
export const reportPath = (communitySlug: string, eventSlug: string) =>
  `/comunidad/${communitySlug}/events/${eventSlug}/reportar`;

/**
 * "Si algo no está bien, hablá con: Ana G. y Beto R. · Reportar un problema": the event's
 * code-of-conduct responders, by name, and the report form (anonymous allowed).
 */
export function EventConduct({ event }: { event: PublicEvent }) {
  if (event.status === "cancelled") return null;
  const names = new Intl.ListFormat("es", { type: "conjunction" }).format(event.responders);

  return (
    <section
      aria-labelledby="conducta-title"
      className="mt-10 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
    >
      <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-zinc-500" />
      <div className="min-w-0 text-[15px] leading-relaxed text-zinc-300">
        <h2 className="text-[13px] font-medium tracking-[0.12em] text-zinc-400 uppercase" id="conducta-title">
          Código de conducta
        </h2>
        <p className="mt-1.5">
          {event.responders.length > 0
            ? `Si algo no está bien, hablá con ${names}${names.endsWith(".") ? "" : "."} `
            : "Si algo no está bien, avisanos. "}
          <Link
            className="font-medium text-yellow-400 underline underline-offset-4"
            href={reportPath(event.community.slug, event.slug)}
          >
            Reportar un problema
          </Link>
        </p>
        <p className="mt-1 text-[14px] text-zinc-400">
          Este evento sigue el{" "}
          <Link className="underline underline-offset-4 hover:text-zinc-200" href="/codigo-de-conducta">
            código de conducta de OWU
          </Link>
          . Podés reportar sin dar tu nombre.
        </p>
      </div>
    </section>
  );
}
