"use client";

import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Images, MapPin, Sparkles, Users } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "app/lib/utils";
import { CommunityLogo, Kbd } from "components/community/ui";
import { formatDate, formatTime, KIND_LABEL, STATUS_LABEL } from "lib/timeline/format";
import { photoSources } from "lib/timeline/image";

import type { GalleryPhoto } from "./[slug]/Gallery";
import { rememberReturn } from "./archive-data";
import type { EventDetail } from "./[slug]/datos.json/route";

// Its own (empty) Suspense boundary: without a `loading`, the first open suspends up to the
// nearest one above (the archive, the page) and blanks it while the chunk loads, losing the scroll
const Lightbox = dynamic(() => import("./[slug]/Lightbox"), { loading: () => null });
const number = new Intl.NumberFormat("es-UY");

/* ------------------------------------------------------------------ data */

const cache = new Map<string, Promise<EventDetail | null>>();

/** One event's detail, fetched once (and kept) per page view */
export function loadDetail(slug: string) {
  let request = cache.get(slug);
  if (!request) {
    request = fetch(`/timeline/${slug}/datos.json`)
      .then((response) => (response.ok ? (response.json() as Promise<EventDetail>) : null))
      .catch(() => null);
    cache.set(slug, request);
  }
  return request;
}

function useDetail(slug: string) {
  const [detail, setDetail] = useState<{ slug: string; data: EventDetail | null } | null>(null);
  useEffect(() => {
    let live = true;
    void loadDetail(slug).then((data) => live && setDetail({ slug, data }));
    return () => {
      live = false;
    };
  }, [slug]);
  return detail?.slug === slug ? detail : null;
}

/* ---------------------------------------------------------------- pieces */

const credit = (photo: EventDetail["event"]["photos"] extends (infer P)[] | undefined ? P : never) =>
  photo.by ? `Foto: ${photo.by}${photo.source && photo.source !== photo.by ? ` · ${photo.source}` : ""}` : photo.source;

function Photos({ detail }: { detail: EventDetail }) {
  const [open, setOpen] = useState<number | null>(null);
  const photos: GalleryPhoto[] = (detail.event.photos ?? []).map((photo) => ({
    tile: photoSources(photo.src, "(min-width: 1024px) 140px, 33vw"),
    full: photoSources(photo.src, "100vw"),
    alt: photo.alt ?? `Foto de ${detail.event.title}`,
    credit: credit(photo),
    page: photo.page,
    license: photo.license,
  }));
  if (!photos.length) return null;
  const shown = photos.slice(0, 6);
  const more = Math.max(photos.length, detail.event.photoCount ?? 0) - shown.length;

  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5">
        {shown.map((photo, index) => (
          <m.li
            key={photo.tile.src}
            animate={{ opacity: 1, scale: 1 }}
            initial={{ opacity: 0, scale: 0.94 }}
            transition={{ delay: 0.04 * index, duration: 0.3 }}
          >
            <button
              aria-label={`Ver la foto ${index + 1} de ${photos.length}`}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-900 focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:outline-none"
              onClick={() => setOpen(index)}
              type="button"
            >
              <img
                alt={photo.alt}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                decoding="async"
                loading="lazy"
                sizes={photo.tile.sizes}
                src={photo.tile.src}
                srcSet={photo.tile.srcSet}
              />
              {index === shown.length - 1 && more > 0 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 text-sm font-semibold text-white">
                  +{number.format(more)}
                </span>
              ) : null}
            </button>
          </m.li>
        ))}
      </ul>
      {open !== null ? <Lightbox index={open} onChange={setOpen} photos={photos} title={detail.event.title} /> : null}
    </>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 360;
  return (
    <div>
      <p
        className={cn("text-[14px] leading-relaxed whitespace-pre-line text-zinc-300", !open && long && "line-clamp-6")}
      >
        {text}
      </p>
      {long ? (
        <button
          className="mt-1 text-[13px] text-yellow-300 hover:underline"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Leer menos" : "Leer más"}
        </button>
      ) : null}
    </div>
  );
}

function Body({ detail }: { detail: EventDetail }) {
  const { event, community } = detail;
  const time = formatTime(event.start);
  const source = event.url ?? event.wayback;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[12px] text-zinc-200">
            {KIND_LABEL[event.kind]}
          </span>
          {event.layer === "ecosystem" ? (
            <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[12px] text-zinc-200">Ecosistema</span>
          ) : null}
          {event.online ? (
            <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[12px] text-zinc-200">Online</span>
          ) : null}
          {event.highlights?.map((highlight) => (
            <span
              key={highlight}
              className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2.5 py-0.5 text-[12px] text-yellow-200"
            >
              <Sparkles aria-hidden className="size-3" /> {highlight}
            </span>
          ))}
        </div>
        <h3 className="font-title text-xl leading-snug font-semibold tracking-tight text-white sm:text-2xl">
          {event.title}
        </h3>
        <dl className="grid gap-2 text-[14px] text-zinc-300">
          <div>
            <dt className="sr-only">Fecha</dt>
            <dd className="flex items-start gap-2">
              <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
              <span>
                {formatDate(event, true)}
                {time ? ` · ${time}` : ""}
                {event.confidence ? (
                  <span className="text-zinc-400">
                    {" "}
                    · fecha {event.confidence === "low" ? "aproximada" : "de una sola fuente"}
                  </span>
                ) : null}
              </span>
            </dd>
          </div>
          {event.venue || event.city ? (
            <div>
              <dt className="sr-only">Lugar</dt>
              <dd className="flex items-start gap-2">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                <span>
                  {[event.venue, event.city && event.city !== event.venue ? event.city : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </dd>
            </div>
          ) : null}
          {event.rsvps || event.attendance ? (
            <div>
              <dt className="sr-only">Gente</dt>
              <dd className="flex items-start gap-2">
                <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                {event.rsvps ? `${number.format(event.rsvps)} anotados` : event.attendance}
              </dd>
            </div>
          ) : null}
        </dl>
        {community ? (
          <Link
            className="flex items-center gap-3 rounded-xl border border-white/[0.08] p-2.5 transition-colors hover:border-white/20"
            href={`/timeline?comunidad=${community.slug}#archivo`}
            scroll={false}
          >
            <CommunityLogo logo={community.logo ?? null} name={community.name} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-zinc-100">{community.name}</span>
              <span className="block text-[12px] text-zinc-400">
                {community.events} eventos · {STATUS_LABEL[community.status]}
              </span>
            </span>
          </Link>
        ) : null}
      </div>

      <Photos detail={detail} />

      {event.talks?.length ? (
        <section aria-label="Charlas">
          <h4 className="mb-2 text-[12px] font-medium tracking-wide text-zinc-400 uppercase">Charlas</h4>
          <ol className="flex flex-col gap-2">
            {event.talks.slice(0, 8).map((talk) => (
              <li key={talk.title} className="text-[14px]">
                <span className="text-zinc-100">{talk.title}</span>
                {talk.speakers?.length ? <span className="text-zinc-400"> · {talk.speakers.join(", ")}</span> : null}
              </li>
            ))}
            {event.talks.length > 8 ? (
              <li className="text-[13px] text-zinc-400">y {event.talks.length - 8} más</li>
            ) : null}
          </ol>
        </section>
      ) : null}

      {event.description ? <Description text={event.description} /> : null}

      <div className="flex flex-wrap gap-2">
        <Link
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-medium text-zinc-950 transition-colors hover:bg-yellow-300"
          href={`/timeline/${event.slug}`}
          onClick={() => rememberReturn(event.slug)}
        >
          Ver la página del evento <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
        {community?.photos ? (
          <Link
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-4 text-[13px] text-zinc-200 transition-colors hover:border-white/30"
            href={`/timeline/fotos/${community.slug}`}
          >
            <Images aria-hidden className="size-3.5" /> Todas las fotos de {community.name}
          </Link>
        ) : null}
        {source ? (
          <a
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-4 text-[13px] text-zinc-200 transition-colors hover:border-white/30"
            href={source}
            rel="noopener noreferrer"
            target="_blank"
          >
            {event.url?.includes("meetup.com") ? "Meetup" : "Fuente"} <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex animate-pulse flex-col gap-3">
      <div className="h-5 w-24 rounded-full bg-white/[0.06]" />
      <div className="h-7 w-4/5 rounded-lg bg-white/[0.06]" />
      <div className="h-4 w-1/2 rounded bg-white/[0.06]" />
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="aspect-[4/3] rounded-lg bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

export type Neighbour = { slug: string; title: string; start: string } | undefined;

/**
 * One event, read without leaving the list. ←/→ (or the buttons, or a swipe on phones) walk the
 * list as filtered, the neighbours are fetched ahead, and the content slides the way you move.
 */
export default function EventPanel({
  slug,
  previous,
  next,
  position,
  direction,
  onMove,
}: {
  slug: string;
  previous: Neighbour;
  next: Neighbour;
  /** "12 de 1.796" */
  position: string;
  /** -1 going back, 1 forward: where the new content comes from */
  direction: number;
  onMove: (slug: string, direction: number) => void;
}) {
  const detail = useDetail(slug);

  // The neighbours' details are ready before anyone asks for them
  useEffect(() => {
    if (previous) void loadDetail(previous.slug);
    if (next) void loadDetail(next.slug);
  }, [previous, next]);

  return (
    <div className="flex h-full flex-col">
      {/* In the phone's sheet this is what scrolls (the sheet has a fixed height); on desktop, the panel around it */}
      <div className="relative min-h-0 flex-1 overflow-x-hidden" data-reader>
        <AnimatePresence custom={direction} initial={false} mode="popLayout">
          <m.div
            key={slug}
            animate={{ opacity: 1, x: 0 }}
            custom={direction}
            exit={{ opacity: 0, x: direction * -40 }}
            initial={{ opacity: 0, x: direction * 40 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {detail?.data ? (
              <Body detail={detail.data} />
            ) : detail ? (
              <p className="text-zinc-400">No encontramos este evento.</p>
            ) : (
              <Skeleton />
            )}
          </m.div>
        </AnimatePresence>
      </div>
      {/* Pinned to the bottom of the panel: the way to the next event never scrolls away */}
      <div className="sticky bottom-0 -mx-5 mt-5 border-t border-white/[0.08] bg-zinc-950/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="group flex min-w-0 flex-col items-start gap-0.5 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-40"
            disabled={!previous}
            onClick={() => previous && onMove(previous.slug, -1)}
            type="button"
          >
            <span className="flex items-center gap-1 text-[12px] text-zinc-400">
              <ChevronLeft aria-hidden className="size-3.5" /> Anterior{" "}
              <Kbd className="ml-1 hidden lg:inline-flex">↑</Kbd>
            </span>
            <span className="line-clamp-1 text-[13px] text-zinc-200 group-hover:text-white">
              {previous?.title ?? "—"}
            </span>
          </button>
          <button
            className="group flex min-w-0 flex-col items-end gap-0.5 rounded-xl p-2 text-right transition-colors hover:bg-white/[0.04] disabled:opacity-40"
            disabled={!next}
            onClick={() => next && onMove(next.slug, 1)}
            type="button"
          >
            <span className="flex items-center gap-1 text-[12px] text-zinc-400">
              <Kbd className="mr-1 hidden lg:inline-flex">↓</Kbd> Siguiente{" "}
              <ChevronRight aria-hidden className="size-3.5" />
            </span>
            <span className="line-clamp-1 text-[13px] text-zinc-200 group-hover:text-white">{next?.title ?? "—"}</span>
          </button>
        </div>
        <p className="mt-1 text-center font-terminal text-[11px] text-zinc-400 tabular-nums">{position}</p>
      </div>
    </div>
  );
}
