import { ArrowUpRight, MapPin, Wifi } from "lucide-react";
import Link from "next/link";

import { cn } from "app/lib/utils";
import type { CommunityEvent } from "lib/community/events";
import { dateParts, dayKey } from "lib/community/time";

import { Badge, outbound } from "./ui";

/**
 * One event: a mono date column, the title (the whole row links to the event)
 * and who organizes it (links to the directory when the group is in it).
 */
export function EventRow({ event, showMonth = true }: { event: CommunityEvent; showMonth?: boolean }) {
  const when = dateParts(event.start);

  return (
    <li
      className={cn(
        "group relative flex items-start gap-4 px-4 py-4 transition-colors hover:bg-white/[0.025] sm:items-center sm:gap-6 sm:px-6",
        event.isOwu && "bg-yellow-400/[0.035] hover:bg-yellow-400/[0.06]"
      )}
    >
      <time
        className="flex w-12 shrink-0 flex-col items-center rounded-md border border-line py-1.5 text-center sm:w-14"
        dateTime={event.start}
      >
        <span className="font-terminal text-[10px] tracking-[0.08em] text-yellow-400 uppercase">
          {showMonth ? when.month : when.weekday}
        </span>
        <span className="text-lg leading-tight font-semibold text-zinc-50 tabular-nums">{when.day}</span>
      </time>

      <div className="min-w-0 flex-1">
        <a
          className="line-clamp-2 text-[15px] leading-snug font-medium text-zinc-100 after:absolute after:inset-0 after:content-[''] group-hover:text-zinc-50 sm:line-clamp-1"
          href={outbound(event.url, "evento")}
          rel="noopener"
          target="_blank"
        >
          {event.title}
        </a>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-terminal text-[11.5px] text-zinc-500">
          <span className="text-zinc-400 capitalize">
            {showMonth ? `${when.weekday} ${when.time}` : when.time}
          </span>
          <span aria-hidden>·</span>
          {event.communitySlug ? (
            <Link
              className="relative z-10 text-zinc-400 underline decoration-white/15 underline-offset-4 transition-colors hover:text-zinc-100 hover:decoration-yellow-400"
              href={`/comunidades#${event.communitySlug}`}
            >
              {event.group}
            </Link>
          ) : (
            <span>{event.group}</span>
          )}
          <span aria-hidden>·</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            {event.venue ? (
              <MapPin aria-hidden className="size-3 shrink-0" />
            ) : (
              <Wifi aria-hidden className="size-3 shrink-0" />
            )}
            <span className="truncate">{event.venue ?? "Online"}</span>
          </span>
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {event.isOwu ? <Badge tone="accent">Organiza OWU</Badge> : null}
        <ArrowUpRight
          aria-hidden
          className="size-4 text-zinc-600 transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-200"
        />
      </div>
    </li>
  );
}

export function EventList({ events, showMonth = true }: { events: CommunityEvent[]; showMonth?: boolean }) {
  return (
    <ol className="divide-y divide-line">
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
