import { Play, Presentation } from "lucide-react";
import Image from "next/image";

import { cn } from "app/lib/utils";
import { TALK_EVENTS } from "keystatic/collections/talks";
import type { Talk } from "lib/community/content";
import { dateParts } from "lib/community/time";
import { topicLabel } from "lib/community/topics";

import { outbound } from "./ui";

const EVENT_LABELS = new Map<string, string>(TALK_EVENTS.map(({ value, label }) => [value, label]));

export const talkEventLabel = (event: string) => EVENT_LABELS.get(event) ?? "Otro evento";

/** The talk's OWU-branded cover, rendered at build time (see /charlas/og/[slug]) */
export const talkCoverUrl = (slug: string) => `/charlas/og/${slug}`;

/** A talk from the archive: its branded cover (event, title and speakers), then who gave it */
export default function TalkCard({ talk, className }: { talk: Talk; className?: string }) {
  // A talk still to be given (CONF agenda) shows its date instead of "no recording"
  const when = dateParts(`${talk.date}T12:00:00-03:00`);
  const upcoming = Date.parse(`${talk.date}T23:59:59-03:00`) > Date.now();

  return (
    <article className={cn("group relative flex scroll-mt-24 flex-col gap-4", className)} id={talk.slug}>
      <div className="relative aspect-[40/21] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c0c0f] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-[border-color,transform,box-shadow] duration-300 group-hover:-translate-y-0.5 group-hover:border-white/[0.14] group-hover:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.9)]">
        <Image
          alt=""
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
          fill
          sizes="(min-width: 1024px) 368px, (min-width: 640px) 50vw, 100vw"
          src={talkCoverUrl(talk.slug)}
        />
        {talk.video ? (
          <span className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-yellow-400 text-zinc-950 shadow-lg shadow-black/40 transition-transform duration-300 group-hover:scale-110">
            <Play aria-hidden className="size-4 translate-x-px fill-current" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[15px] leading-snug font-semibold text-zinc-50">
          {talk.video ? (
            <a
              className="after:absolute after:inset-0 after:content-[''] hover:text-white"
              href={outbound(talk.video, "charla")}
              rel="noopener"
              target="_blank"
            >
              {talk.title}
            </a>
          ) : (
            talk.title
          )}
        </h3>
        <p className="text-sm text-zinc-400">{talk.speakers.join(", ")}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {talk.topics.slice(0, 2).map((topic) => (
            <span key={topic}>#{topicLabel(topic).toLowerCase().replace(/\s+/g, "-")}</span>
          ))}
          {talk.slides ? (
            <a
              className="relative z-10 inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-white"
              href={outbound(talk.slides, "slides")}
              rel="noopener"
              target="_blank"
            >
              <Presentation aria-hidden className="size-3.5" /> Slides
            </a>
          ) : null}
          {talk.video ? null : upcoming ? (
            <span className="text-yellow-400">
              Se presenta el {when.weekday} {when.day} {when.month}
            </span>
          ) : (
            <span className="text-zinc-600">Sin grabación</span>
          )}
        </div>
      </div>
    </article>
  );
}
