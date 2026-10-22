import { ArrowUpRight, MapPin, Wifi } from "lucide-react";
import Link from "next/link";

import { cn } from "app/lib/utils";
import type { CommunityEvent } from "lib/community/events";
import { dateParts, dayKey } from "lib/community/time";

import { Badge, outbound } from "./ui";

/**
 * One event: a big Poppins day, the title (the whole row links to the event)
 * and who organizes it (links to the directory when the group is in it).
 */
export function EventRow({ event, showMonth = true }: { event: CommunityEvent; showMonth?: boolean }) {
  const when = dateParts(event.start);

  return (
    <li
      className={cn(
        "group relative flex items-center gap-5 px-5 py-4 transition-colors hover:bg-white/[0.03] sm:gap-6 sm:px-6 sm:py-5",
        event.isOwu && "bg-yellow-400/[0.04] hover:bg-yellow-400/[0.07]"
      )}
    >
      <time className="flex w-12 shrink-0 flex-col items-center text-center sm:w-14" dateTime={event.start}>
        <span className="font-title text-[26px] leading-none font-bold text-white tabular-nums sm:text-3xl">
          {when.day}
        </span>
        <span className="mt-1.5 text-[11px] font-semibold tracking-[0.14em] text-yellow-400 uppercase">
          {showMonth ? when.month : when.weekday}
        </span>
      </time>

      <div className="min-w-0 flex-1">
        <a
          className="line-clamp-2 text-[15px] leading-snug font-semibold text-zinc-50 after:absolute after:inset-0 after:content-[''] sm:line-clamp-1 sm:text-base"
          href={outbound(event.url, "evento")}
          rel="noopener"
          target="_blank"
        >
          {event.title}
        </a>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-400">
          <span className="capitalize tabular-nums">
            {showMonth ? `${when.weekday} · ${when.time}` : `${when.time}`} h
          </span>
          <span aria-hidden className="text-zinc-600">
            ·
          </span>
          {event.communitySlug ? (
            <Link
              className="relative z-10 underline decoration-white/15 underline-offset-4 transition-colors hover:text-white hover:decoration-yellow-400"
              href={`/comunidades#${event.communitySlug}`}
            >
              {event.group}
            </Link>
          ) : (
            <span>{event.group}</span>
          )}
          <span aria-hidden className="text-zinc-600">
            ·
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 text-zinc-500">
            {event.venue ? (
              <MapPin aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <Wifi aria-hidden className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{event.venue ?? "Online"}</span>
          </span>
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        {event.isOwu ? <Badge tone="accent">Organiza OWU</Badge> : null}
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition-[background-color,border-color,color,transform] duration-300 group-hover:scale-105 group-hover:border-yellow-400 group-hover:bg-yellow-400 group-hover:text-zinc-950"
        >
          <ArrowUpRight className="size-4" />
        </span>
      </div>
    </li>
  );
}

export function EventList({ events, showMonth = true }: { events: CommunityEvent[]; showMonth?: boolean }) {
  return (
    <ol className="divide-y divide-white/[0.07]">
      {events.map((event) => (
        <EventRow key={event.id} event={event} showMonth={showMonth} />
      ))}
    </ol>
  );
}

/** Splits upcoming events into this week (through Sunday, Montevideo time) and later */
export function splitThisWeek(events: CommunityEvent[], now = new Date()) {
  const today = dayKey(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const daysToSunday = (7 - weekday) % 7;
  const sunday = dayKey(new Date(Date.parse(`${today}T12:00:00Z`) + daysToSunday * 86_400_000));

  return {
    thisWeek: events.filter((event) => dayKey(event.start) <= sunday),
    later: events.filter((event) => dayKey(event.start) > sunday),
  };
}
