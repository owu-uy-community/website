import { Play, Presentation } from "lucide-react";

import { cn } from "app/lib/utils";
import { TALK_EVENTS } from "keystatic/collections/talks";
import type { Talk } from "lib/community/content";
import { dateParts } from "lib/community/time";
import { topicLabel } from "lib/community/topics";

import { outbound } from "./ui";

const EVENT_LABELS = new Map<string, string>(TALK_EVENTS.map(({ value, label }) => [value, label]));

export const talkEventLabel = (event: string) => EVENT_LABELS.get(event) ?? "Otro evento";

const youtubeId = (url: string | null) =>
  url?.match(/(?:youtu\.be\/|v=|\/embed\/|\/live\/|\/shorts\/)([\w-]{11})/)?.[1] ?? null;

const year = (date: string) => date.slice(0, 4);

/** A talk from the archive: cover (YouTube thumbnail or an event-colored card), title, speakers, links */
export default function TalkCard({ talk, className }: { talk: Talk; className?: string }) {
  const videoId = youtubeId(talk.video);
  const isConf = talk.event.startsWith("owu-conf");
  // A talk still to be given (CONF agenda) shows its date instead of "no recording"
  const when = dateParts(`${talk.date}T12:00:00-03:00`);
  const upcoming = Date.parse(`${talk.date}T23:59:59-03:00`) > Date.now();

  return (
    <article className={cn("group relative flex scroll-mt-24 flex-col gap-3", className)} id={talk.slug}>
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-lg border border-line",
          isConf
            ? "bg-[radial-gradient(120%_90%_at_100%_0%,rgba(245,187,3,0.35),transparent_55%),linear-gradient(135deg,#0b3a73,#0162C8)]"
            : "bg-[radial-gradient(120%_90%_at_100%_0%,rgba(250,204,21,0.28),transparent_55%),linear-gradient(135deg,#1a1d0a,#3e4713)]"
        )}
      >
        {videoId ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt=""
            className="absolute inset-0 size-full object-cover opacity-80 transition-opacity duration-300 group-hover:opacity-100"
            loading="lazy"
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          />
        ) : (
          <>
            <span aria-hidden className="absolute top-1 left-4 font-serif text-6xl leading-none text-white/20">
              “
            </span>
            <p className="absolute inset-x-5 top-9 line-clamp-3 text-[13.5px] leading-snug text-white/75">
              {talk.summary}
            </p>
          </>
        )}
        <span className="absolute bottom-3 left-3 rounded bg-black/60 px-1.5 py-0.5 font-terminal text-[10px] tracking-[0.06em] text-zinc-200 uppercase backdrop-blur">
          {talkEventLabel(talk.event).includes(year(talk.date))
            ? talkEventLabel(talk.event)
            : `${talkEventLabel(talk.event)} · ${year(talk.date)}`}
        </span>
        {talk.video ? (
          <span className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg transition-transform duration-300 group-hover:scale-110">
            <Play aria-hidden className="size-4 translate-x-px fill-current" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[15px] leading-snug font-medium text-zinc-100">
          {talk.video ? (
            <a
              className="after:absolute after:inset-0 after:content-[''] hover:text-zinc-50"
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-terminal text-[11px] text-zinc-500">
          {talk.topics.slice(0, 2).map((topic) => (
            <span key={topic}>#{topicLabel(topic).toLowerCase().replace(/\s+/g, "-")}</span>
          ))}
          {talk.slides ? (
            <a
              className="relative z-10 inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100"
              href={outbound(talk.slides, "slides")}
              rel="noopener"
              target="_blank"
            >
              <Presentation aria-hidden className="size-3" /> Slides
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
