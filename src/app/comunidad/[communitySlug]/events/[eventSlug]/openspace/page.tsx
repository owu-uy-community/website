import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";

import { AgendaSurface } from "components/displays/AgendaSurface";
import { EventAgenda } from "components/displays/EventAgenda";
import { LiveAgenda } from "components/displays/LiveAgenda";
import { getRoomsByOpenSpace } from "lib/orpc/rooms/services/get-by-open-space";
import { getSchedulesByOpenSpace } from "lib/orpc/schedules/services/get-by-open-space";
import { getTracksForEvent } from "lib/orpc/sticky-notes/services/get-all-tracks";
import { getEventBySlugs } from "lib/tenant-server";

type Params = Promise<{ communitySlug: string; eventSlug: string }>;

// The board changes constantly while the event runs; LiveAgenda pushes updates,
// this only bounds how stale a cold visit can be.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) return {};

  const title = `Agenda · ${resolved.event.name}`;

  return {
    title,
    description: `La grilla del open space de ${resolved.event.name}, en vivo.`,
    openGraph: { title, description: `Open space de ${resolved.community.name}` },
  };
}

function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}

/** "Hoy" / "Faltan N días" / "Terminó" — the first thing a visitor wants. */
function eventStatus(start: Date, end: Date): { label: string; live: boolean } {
  const now = Date.now();
  if (now >= start.getTime() && now <= end.getTime()) return { label: "Sucediendo ahora", live: true };
  if (now > end.getTime()) return { label: "Finalizado", live: false };

  const days = Math.ceil((start.getTime() - now) / 86_400_000);

  return { label: days <= 1 ? "Mañana" : `Faltan ${days} días`, live: false };
}

export default async function EventOpenSpacePage({ params }: { params: Params }) {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) notFound();

  const { community, event } = resolved;
  const [rooms, schedules, tracks] = await Promise.all([
    getRoomsByOpenSpace({ openSpaceId: event.id }),
    getSchedulesByOpenSpace({ openSpaceId: event.id }),
    getTracksForEvent(event.id),
  ]);

  const status = eventStatus(event.startDate, event.endDate);
  const talkCount = tracks.length;

  return (
    <main className="min-h-screen bg-[#18181b] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <header>
          <Link
            className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
            href={`/comunidad/${community.slug}`}
          >
            <span className="flex size-6 items-center justify-center rounded bg-yellow-400 text-[10px] font-extrabold text-black">
              {community.name.slice(0, 3).toUpperCase()}
            </span>
            {community.name}
          </Link>

          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">{event.name}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-400">
            <span className="flex items-center gap-1.5">
              <CalendarDays aria-hidden className="size-4" />
              {formatDate(event.startDate, event.timezone)}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                status.live ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-zinc-400"
              }`}
            >
              {status.label}
            </span>
            {talkCount > 0 ? <span>{talkCount} charlas</span> : null}
            {event.venueMapUrl ? (
              <a
                className="flex items-center gap-1.5 transition-colors hover:text-white"
                href={event.venueMapUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MapPin aria-hidden className="size-4" />
                Cómo llegar
                <ArrowUpRight aria-hidden className="size-3" />
              </a>
            ) : null}
          </div>
        </header>

        <div className="mt-10">
          <AgendaSurface eventName={event.name} live={<LiveAgenda eventId={event.id} />}>
            <EventAgenda rooms={rooms} schedules={schedules} tracks={tracks} />
          </AgendaSurface>
        </div>

        <footer className="mt-14 border-t border-white/10 pt-6 text-sm text-zinc-500">
          Open space de {community.name} ·{" "}
          <a className="text-zinc-300 underline-offset-4 hover:underline" href="https://owu.uy">
            owu.uy
          </a>
        </footer>
      </div>
    </main>
  );
}
