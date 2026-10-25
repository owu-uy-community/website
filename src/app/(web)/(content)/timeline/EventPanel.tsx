"use client";

import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Images, MapPin, Sparkles, Users } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "app/lib/utils";
import { CommunityLogo, Kbd } from "components/community/ui";
import type { ArchiveCommunity, ArchiveRow } from "lib/timeline/data";
import { formatDate, formatTime, KIND_LABEL, STATUS_LABEL } from "lib/timeline/format";
import { photoSources } from "lib/timeline/image";
import type { TimelineEvent, TimelineKind } from "lib/timeline/types";

import type { GalleryPhoto } from "./[slug]/Gallery";
import { rememberReturn } from "./archive-data";
import type { EventDetail } from "./[slug]/datos.json/route";
import Markdown from "./Markdown";
import { Line } from "./Skeletons";

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

const PILL = "rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[12px] text-zinc-200";
const BUTTON = "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px]";
const OUTLINE = cn(BUTTON, "border border-white/15 text-zinc-200 transition-colors hover:border-white/30");
const TILE = "group relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-900";

/**
 * The top of an event: what it was, when, where, who came and whose it was. The archive's row
 * already says all of it, so it shows at once, exactly as it will stay once the rest arrives.
 */
type View = {
  slug: string;
  title: string;
  kind: TimelineKind;
  ecosystem: boolean;
  online: boolean;
  highlights: string[];
  start: string;
  end?: string;
  confidence?: TimelineEvent["confidence"];
  place: string;
  people?: string;
  community:
    | (Pick<ArchiveCommunity, "slug" | "name" | "status" | "events"> & { logo?: string; photos?: number })
    | null;
};

const viewOfDetail = ({ event, community }: EventDetail): View => ({
  slug: event.slug,
  title: event.title,
  kind: event.kind,
  ecosystem: event.layer === "ecosystem",
  online: Boolean(event.online),
  highlights: event.highlights ?? [],
  start: event.start,
  end: event.end,
  confidence: event.confidence,
  place: [event.venue, event.city && event.city !== event.venue ? event.city : null].filter(Boolean).join(" · "),
  people: event.rsvps ? `${number.format(event.rsvps)} anotados` : event.attendance,
  community: community ? { ...community, events: community.events ?? 0 } : null,
});

const viewOfRow = ({ row, community }: Preview): View => ({
  slug: row.s,
  title: row.t,
  kind: row.k,
  ecosystem: Boolean(row.x),
  online: Boolean(row.o),
  highlights: row.h ? [row.h] : [],
  start: row.d,
  end: row.e,
  confidence: row.q,
  place: row.v ?? "",
  people: row.r ? `${number.format(row.r)} anotados` : row.a,
  community: community ?? null,
});

function Header({ view }: { view: View }) {
  const time = formatTime(view.start);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={PILL}>{KIND_LABEL[view.kind]}</span>
        {view.ecosystem ? <span className={PILL}>Ecosistema</span> : null}
        {view.online ? <span className={PILL}>Online</span> : null}
        {view.highlights.map((highlight) => (
          <span
            key={highlight}
            className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2.5 py-0.5 text-[12px] text-yellow-200"
          >
            <Sparkles aria-hidden className="size-3" /> {highlight}
          </span>
        ))}
      </div>
      <h3 className="font-title text-xl leading-snug font-semibold tracking-tight text-white sm:text-2xl">
        {view.title}
      </h3>
      <dl className="grid gap-2 text-[14px] text-zinc-300">
        <div>
          <dt className="sr-only">Fecha</dt>
          <dd className="flex items-start gap-2">
            <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <span>
              {formatDate({ start: view.start, end: view.end }, true)}
              {time ? ` · ${time}` : ""}
              {view.confidence ? (
                <span className="text-zinc-400">
                  {" "}
                  · fecha {view.confidence === "low" ? "aproximada" : "de una sola fuente"}
                </span>
              ) : null}
            </span>
          </dd>
        </div>
        {view.place ? (
          <div>
            <dt className="sr-only">Lugar</dt>
            <dd className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
              <span>{view.place}</span>
            </dd>
          </div>
        ) : null}
        {view.people ? (
          <div>
            <dt className="sr-only">Gente</dt>
            <dd className="flex items-start gap-2">
              <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
              {view.people}
            </dd>
          </div>
        ) : null}
      </dl>
      {view.community ? (
        <Link
          className="flex items-center gap-3 rounded-xl border border-white/[0.08] p-2.5 transition-colors hover:border-white/20"
          href={`/timeline?comunidad=${view.community.slug}#archivo`}
          scroll={false}
        >
          <CommunityLogo logo={view.community.logo ?? null} name={view.community.name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[14px] text-zinc-100">{view.community.name}</span>
            <span className="block text-[12px] text-zinc-400">
              {view.community.events} eventos · {STATUS_LABEL[view.community.status]}
            </span>
          </span>
        </Link>
      ) : null}
    </div>
  );
}

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
          <li key={photo.tile.src}>
            <button
              aria-label={`Ver la foto ${index + 1} de ${photos.length}`}
              className={cn(TILE, "focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:outline-none")}
              onClick={() => setOpen(index)}
              type="button"
            >
              <m.img
                alt={photo.alt}
                animate={{ opacity: 1 }}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                decoding="async"
                initial={{ opacity: 0 }}
                loading="lazy"
                sizes={photo.tile.sizes}
                src={photo.tile.src}
                srcSet={photo.tile.srcSet}
                transition={{ delay: 0.04 * index, duration: 0.3 }}
              />
              {index === shown.length - 1 && more > 0 ? <More count={more} /> : null}
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? <Lightbox index={open} onChange={setOpen} photos={photos} title={detail.event.title} /> : null}
    </>
  );
}

const More = ({ count }: { count: number }) => (
  <span className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 text-sm font-semibold text-white">
    +{number.format(count)}
  </span>
);

function Talks({ talks }: { talks: NonNullable<EventDetail["event"]["talks"]> }) {
  return (
    <section aria-label="Charlas">
      <h4 className="mb-2 text-[12px] font-medium tracking-wide text-zinc-400 uppercase">Charlas</h4>
      <ol className="flex flex-col gap-2">
        {talks.slice(0, 8).map((talk) => (
          <li key={talk.title} className="text-[14px]">
            <span className="text-zinc-100">{talk.title}</span>
            {talk.speakers?.length ? <span className="text-zinc-400"> · {talk.speakers.join(", ")}</span> : null}
          </li>
        ))}
        {talks.length > 8 ? <li className="text-[13px] text-zinc-400">y {talks.length - 8} más</li> : null}
      </ol>
    </section>
  );
}

// Past this length the description folds to 6 lines with a "Leer más"
const FOLD = 360;

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > FOLD;
  return (
    <div>
      {/* Folded to exactly 6 lines (what its skeleton holds), fading out at the fold */}
      <div
        className={cn(
          "text-[14px] leading-relaxed text-zinc-300",
          !open && long && "max-h-[6lh] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]"
        )}
      >
        <Markdown className="space-y-2" text={text} />
      </div>
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

function Buttons({ view, source }: { view: View; source: string | null | undefined }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        className={cn(BUTTON, "bg-white font-medium text-zinc-950 transition-colors hover:bg-yellow-300")}
        href={`/timeline/${view.slug}`}
        onClick={() => rememberReturn(view.slug)}
      >
        Ver la página del evento <ArrowUpRight aria-hidden className="size-3.5" />
      </Link>
      {view.community?.photos ? (
        <Link className={OUTLINE} href={`/timeline/fotos/${view.community.slug}`}>
          <Images aria-hidden className="size-3.5" /> Todas las fotos de {view.community.name}
        </Link>
      ) : null}
      {source === undefined ? (
        // Still loading: the source link's place, at its size ("Meetup ↗" is 101px)
        <span className={cn(OUTLINE, "w-[100px] animate-pulse border-white/10")} />
      ) : source ? (
        <a className={OUTLINE} href={source} rel="noopener noreferrer" target="_blank">
          {source.includes("meetup.com") ? "Meetup" : "Fuente"} <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

/** What the row can't tell yet, drawn at the size it will take: tiles, talks, the description */
function Pending({ row }: { row: ArchiveRow }) {
  const tiles = Math.min(row.p ?? 0, 6);
  const more = Math.max(row.p ?? 0, row.n ?? 0) - tiles;
  const talks = Math.min(row.tk ?? 0, 8);
  // Folded descriptions take 6 lines; shorter ones about one line per 48 characters of the panel
  const lines = row.l ? (row.l > FOLD ? 6 : Math.max(1, Math.ceil(row.l / 48))) : 0;

  return (
    <>
      {tiles ? (
        <ul aria-hidden className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: tiles }, (_, i) => (
            <li key={i}>
              <span className={cn(TILE, "animate-pulse")}>
                {i === tiles - 1 && more > 0 ? <More count={more} /> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {talks ? (
        <div aria-hidden className="animate-pulse">
          <Line className="mb-2 text-[12px] font-medium uppercase" w="4rem" />
          <div className="flex flex-col gap-2 text-[14px]">
            {Array.from({ length: talks }, (_, i) => (
              <Line key={i} w={["88%", "72%", "94%", "66%"][i % 4]} />
            ))}
            {(row.tk ?? 0) > 8 ? <Line className="text-[13px]" w="4rem" /> : null}
          </div>
        </div>
      ) : null}
      {lines ? (
        <div aria-hidden className="animate-pulse">
          <div className="text-[14px] leading-relaxed">
            {Array.from({ length: lines }, (_, i) => (
              <Line key={i} w={i === lines - 1 && lines > 1 ? "58%" : ["96%", "91%", "98%", "88%", "94%"][i % 5]} />
            ))}
          </div>
          {row.l && row.l > FOLD ? <Line className="mt-1 text-[13px]" w="3.8rem" /> : null}
        </div>
      ) : null}
    </>
  );
}

function Body({ view, detail, row }: { view: View; detail: EventDetail | null; row: ArchiveRow }) {
  const event = detail?.event;
  return (
    <div className="flex flex-col gap-5">
      <Header view={view} />
      {detail && event ? (
        <>
          <Photos detail={detail} />
          {event.talks?.length ? <Talks talks={event.talks} /> : null}
          {(event.summary ?? event.description) ? <Description text={(event.summary ?? event.description)!} /> : null}
        </>
      ) : (
        <Pending row={row} />
      )}
      <Buttons source={event ? (event.url ?? event.wayback ?? null) : undefined} view={view} />
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

export type Neighbour = { slug: string; title: string; start: string } | undefined;
/** The selected event's row in the archive (and its community): what the panel shows while the rest loads */
export type Preview = { row: ArchiveRow; community?: ArchiveCommunity };

/**
 * One event, read without leaving the list. ←/→ (or the buttons, or a swipe on phones) walk the
 * list as filtered, the neighbours are fetched ahead, and the content slides the way you move.
 */
export default function EventPanel({
  slug,
  preview,
  previous,
  next,
  position,
  direction,
  onMove,
}: {
  slug: string;
  preview: Preview;
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
    // At least as tall as the sheet, so the buttons sit at its bottom; what scrolls is the sheet or the
    // panel around it, never this. `clip` cuts the sliding content without making a second scroller
    // (`hidden` on one axis turns the other into `auto`, and a subpixel of overflow drew a scrollbar)
    <div className="flex min-h-full flex-col">
      <div className="relative grow overflow-clip">
        <AnimatePresence custom={direction} initial={false} mode="popLayout">
          <m.div
            key={slug}
            animate={{ opacity: 1, x: 0 }}
            custom={direction}
            exit={{ opacity: 0, x: direction * -40 }}
            initial={{ opacity: 0, x: direction * 40 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {detail && !detail.data ? (
              <p className="text-zinc-400">No encontramos este evento.</p>
            ) : (
              <Body
                detail={detail?.data ?? null}
                row={preview.row}
                view={detail?.data ? viewOfDetail(detail.data) : viewOfRow(preview)}
              />
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
