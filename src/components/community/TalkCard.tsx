import { CalendarClock, CalendarDays, Mic, Play, Presentation, VideoOff } from "lucide-react";
import Image from "next/image";

import { cn } from "app/lib/utils";
import { TALK_EVENTS } from "keystatic/collections/talks";
import type { Talk } from "lib/community/content";
import { dateParts } from "lib/community/time";

import { cardClassName, outbound } from "./ui";

const EVENT_LABELS = new Map<string, string>(TALK_EVENTS.map(({ value, label }) => [value, label]));

export const talkEventLabel = (event: string) => EVENT_LABELS.get(event) ?? "Otro evento";

/** The talk's OWU-branded cover, rendered at build time (see /charlas/og/[slug]) */
export const talkCoverUrl = (slug: string) => `/charlas/og/${slug}`;

/** A talk from the archive: its branded cover, when and where, what it's about and who gave it */
export default function TalkCard({ talk, className }: { talk: Talk; className?: string }) {
  const when = dateParts(`${talk.date}T12:00:00-03:00`);
  // A talk still to be given (CONF agenda) shows its date instead of "no recording"
  const upcoming = Date.parse(`${talk.date}T23:59:59-03:00`) > Date.now();
  const year = talk.date.slice(0, 4);

  return (
    <article
      className={cardClassName(true, cn("group flex h-full scroll-mt-24 flex-col overflow-hidden", className))}
      id={talk.slug}
    >
      <div className="relative aspect-[40/21] overflow-hidden border-b border-white/[0.07] bg-[#0c0c0f]">
        <Image
          alt=""
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
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

      <div className="flex flex-1 flex-col gap-2.5 p-5 sm:p-6">
        <h3 className="font-title text-[17px] leading-snug font-semibold text-zinc-50">
          {talk.video ? (
            <a
              className="after:absolute after:inset-0 after:content-['']"
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
        {talk.summary ? <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">{talk.summary}</p> : null}
        <p className="flex items-start gap-1.5 text-sm text-zinc-300">
          <Mic aria-hidden className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
          {talk.speakers.join(", ")}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.07] pt-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-zinc-500">
            <CalendarDays aria-hidden className="size-3.5 shrink-0" />
            {when.day} {when.month} {year}
          </span>
          <div className="flex items-center gap-3">
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
            {talk.video ? (
              <span className="inline-flex items-center gap-1 font-medium text-yellow-400">
                <Play aria-hidden className="size-3 fill-current" /> Ver charla
              </span>
            ) : upcoming ? (
              <span className="inline-flex items-center gap-1 text-yellow-400">
                <CalendarClock aria-hidden className="size-3.5" /> {when.weekday} {when.day} {when.month}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-zinc-600">
                <VideoOff aria-hidden className="size-3.5" /> Sin grabación
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
