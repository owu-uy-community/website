import { Play, Presentation } from "lucide-react";
import Link from "next/link";

import { cn } from "app/lib/utils";
import { getTimeline } from "lib/timeline/data";
import { formatDate } from "lib/timeline/format";
import { youtubeId } from "lib/timeline/image";
import type { GivenTalk } from "lib/timeline/people";

import { SpeakerNames } from "./Organizers";

const LINK =
  "text-zinc-300 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white hover:decoration-yellow-400";
const BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[13px] text-zinc-200 transition-colors hover:border-yellow-400/60 hover:text-white";

/**
 * Talks with the event they were given at: the video's thumbnail when there's one (and when the
 * list has any), the speakers linked to their profiles, the video and the slides.
 */
export default function Talks({
  talks,
  current,
  className,
}: {
  talks: GivenTalk[];
  /** The profile the list is on: its own name isn't a link */
  current?: string;
  className?: string;
}) {
  const { community } = getTimeline();
  const thumbnails = talks.some(({ talk }) => talk.video);

  return (
    <ol className={cn("flex flex-col divide-y divide-white/[0.06]", className)}>
      {talks.map(({ event, talk }, i) => {
        const id = talk.video ? youtubeId(talk.video) : null;
        // On a profile, the others who gave it with them
        const others = (talk.speakers ?? []).filter((speaker) => !current || speaker.person !== current);
        const name = community.get(event.community)?.name;
        return (
          <li key={`${event.slug}-${i}`} className="flex gap-4 py-4 first:pt-0">
            {thumbnails ? (
              talk.video ? (
                <a
                  aria-hidden
                  className="group relative block aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-900 sm:w-40"
                  href={talk.video}
                  rel="noopener noreferrer"
                  tabIndex={-1}
                  target="_blank"
                >
                  {id ? (
                    <img
                      alt=""
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      decoding="async"
                      height={180}
                      loading="lazy"
                      src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`}
                      width={320}
                    />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors group-hover:bg-yellow-400 group-hover:text-zinc-950">
                      <Play className="ml-0.5 size-4" fill="currentColor" />
                    </span>
                  </span>
                </a>
              ) : (
                <Link
                  aria-hidden
                  className="flex aspect-video w-28 shrink-0 items-center justify-center rounded-lg bg-white/[0.03] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300 sm:w-40"
                  href={`/timeline/${event.slug}#charlas`}
                  tabIndex={-1}
                >
                  <Presentation className="size-5" />
                </Link>
              )
            ) : null}
            <div className="min-w-0 flex-1">
              {/* The talk, on its event's page: its program, the photos, who organized it */}
              <Link
                className="text-zinc-100 transition-colors hover:text-yellow-200"
                href={`/timeline/${event.slug}#charlas`}
              >
                {talk.title}
              </Link>
              {others.length ? (
                <p className="mt-0.5 text-sm text-zinc-300">
                  {current ? "Con " : null}
                  <SpeakerNames speakers={others} />
                </p>
              ) : null}
              <p className="mt-0.5 text-sm text-zinc-400">
                <Link className={LINK} href={`/timeline/${event.slug}`}>
                  {event.title}
                </Link>{" "}
                · {formatDate(event)}
                {name && !event.title.includes(name) ? (
                  <>
                    {" · "}
                    <Link className={LINK} href={`/timeline?comunidad=${event.community}#archivo`}>
                      {name}
                    </Link>
                  </>
                ) : null}
              </p>
              {talk.video || talk.slides ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {talk.video ? (
                    <a className={BUTTON} href={talk.video} rel="noopener noreferrer" target="_blank">
                      <Play aria-hidden className="size-3.5" /> Video
                    </a>
                  ) : null}
                  {talk.slides ? (
                    <a className={BUTTON} href={talk.slides} rel="noopener noreferrer" target="_blank">
                      <Presentation aria-hidden className="size-3.5" /> Slides
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
