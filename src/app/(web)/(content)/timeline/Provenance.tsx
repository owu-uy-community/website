import { ArrowUpRight, Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "app/lib/utils";
import { PRIVACY_EMAIL, SITE_URL } from "lib/community/site";
import type { TimelineLink } from "lib/timeline/types";

/**
 * A takedown request, written for whoever handles it: the page (and the photo) it's about go in
 * the mail, so what to take down is never a guess (/timeline-sync, reference/curation.md)
 */
export const takedownHref = (subject: string, lines: string[]) =>
  `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    `${lines.join("\n")}\n\nQué querés que saquemos (y si sos vos, cómo te llamás en la página):\n`
  )}`;

export const pageLine = (path: string) => `Página: ${SITE_URL}${path}`;

const LINK = "underline decoration-white/25 underline-offset-4 hover:text-zinc-200 hover:decoration-yellow-400";

/**
 * Where every /timeline page ends: what it shows comes from somewhere else, said and linked, and
 * whoever is in it can have it taken down.
 */
export default function Provenance({
  children,
  className,
  path,
  sources,
  subject,
}: {
  /** What this page gathers, and from where */
  children: ReactNode;
  className?: string;
  path: string;
  sources?: TimelineLink[];
  subject: string;
}) {
  return (
    <aside
      aria-labelledby="fuentes"
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm leading-relaxed text-zinc-400 sm:p-6",
        className
      )}
    >
      <h2 className="flex items-center gap-2 font-medium text-zinc-200" id="fuentes">
        <Info aria-hidden className="size-4 text-yellow-300" /> Fuentes
      </h2>
      <p className="mt-2 max-w-3xl text-pretty">{children}</p>
      {sources?.length ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {sources.map((source) => (
            <li key={source.url}>
              <a
                className={cn("inline-flex items-center gap-1 text-zinc-300", LINK)}
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {source.label} <ArrowUpRight aria-hidden className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 max-w-3xl text-pretty">
        OWU solo indexa lo que ya está publicado: no copia ni aloja nada, cada foto se ve desde donde está y todo enlaza
        a su fuente. ¿Aparecés acá o es tuyo y preferís que no esté?{" "}
        <a className={cn("text-zinc-200", LINK)} href={takedownHref(subject, [pageLine(path)])}>
          Pedí que lo saquemos
        </a>{" "}
        y lo sacamos en 72 horas.
      </p>
    </aside>
  );
}
