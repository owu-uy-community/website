"use client";

import { ArrowLeft, ArrowRight, Info, Shuffle, SlidersHorizontal, Undo2 } from "lucide-react";
import { AnimatePresence, m, type PanInfo, useMotionValue, useTransform } from "motion/react";
import Link from "next/link";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "app/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "components/shared/ui/sheet";
import type { ArchiveRow } from "lib/timeline/data";
import { formatDate, KIND_LABEL, plainText } from "lib/timeline/format";
import { photoSources } from "lib/timeline/image";

import { type ArchiveCommunity, useArchiveData } from "../archive-data";
import EventPanel, { loadDetail, type Neighbour } from "../EventPanel";
import { CommunityPicker, MoreFilters } from "../Filters";
import { activeCount, filterRows, useArchiveFilters } from "../filter-state";
import type { EventDetail } from "../[slug]/datos.json/route";

/*
 * The history one event at a time, as a stack of cards: drag the top one away in any direction
 * (or use the buttons, or ←/→) for the next; tap its sides to go through its photos, its middle
 * for the whole event. The order is shuffled, but with a seed kept for the session, so coming
 * back from an event finds the same deck at the same card. The archive's filters apply.
 */

const number = new Intl.NumberFormat("es-UY");
const CARD_SIZES = "(max-width: 640px) 100vw, 448px";
// How far, or how fast, a card has to be thrown to go (px, px/s)
const THROW_PX = 110;
const THROW_SPEED = 650;
// Photo bars on top of a card: one per photo up to this many, then a count
const BARS = 12;
const STORE = "timeline:deck";

/** Fisher–Yates over a seeded generator (mulberry32): the same seed, the same order */
function shuffled<T>(items: T[], seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const useWide = () =>
  useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(min-width: 640px)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => false
  );

/** Where a thrown card goes, and which card is leaving (the others only fade) */
type Exit = { slug: string; x: number; y: number };

/* ---------------------------------------------------------------- a card */

function Card({
  row,
  community,
  depth,
  onThrow,
  onOpen,
}: {
  row: ArchiveRow;
  community?: ArchiveCommunity;
  /** 0 is the top card, the one you can drag; 1 and 2 wait behind it */
  depth: number;
  onThrow: (direction: { x: number; y: number }) => void;
  onOpen: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-320, 320], [-16, 16]);
  const card = useRef<HTMLElement>(null);
  // The finger moves the card with it, so lifting it after a drag also reads as a tap
  const dragged = useRef(false);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [photo, setPhoto] = useState(0);

  // The top card and the next one bring their photos and summary
  useEffect(() => {
    if (depth > 1) return;
    let live = true;
    void loadDetail(row.s).then((data) => live && setDetail(data));
    return () => {
      live = false;
    };
  }, [row.s, depth]);

  const photos = detail?.event.photos?.length ? detail.event.photos.map((p) => p.src) : [row.i!];
  const current = photoSources(photos[Math.min(photo, photos.length - 1)], CARD_SIZES);
  const summary = detail ? plainText(detail.event.summary ?? detail.event.description ?? "") : "";
  const top = depth === 0;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const far = Math.hypot(info.offset.x, info.offset.y) > THROW_PX;
    const fast = Math.hypot(info.velocity.x, info.velocity.y) > THROW_SPEED;
    if (!far && !fast) return;
    const dx = info.offset.x + info.velocity.x * 0.2;
    const dy = info.offset.y + info.velocity.y * 0.2;
    const length = Math.hypot(dx, dy) || 1;
    onThrow({ x: dx / length, y: dy / length });
  };

  return (
    <m.article
      ref={card}
      animate={{ scale: 1 - depth * 0.05, y: depth * 14, opacity: depth > 2 ? 0 : 1 }}
      aria-hidden={!top}
      className={cn(
        "absolute inset-0 overflow-hidden rounded-3xl bg-zinc-900 shadow-2xl ring-1 ring-white/10 select-none",
        top ? "cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none"
      )}
      drag={top}
      dragElastic={0.9}
      dragSnapToOrigin
      // The way out comes from AnimatePresence's `custom`: a leaving card keeps the props of its
      // last render, from before it was thrown
      exit="out"
      initial={{ scale: 0.85, y: 28, opacity: 0 }}
      onDragEnd={onDragEnd}
      onDragStart={() => {
        dragged.current = true;
      }}
      onPointerDown={() => {
        dragged.current = false;
      }}
      onTap={(event) => {
        if (!top || !card.current || dragged.current) return;
        // The card's sides go through its photos; its middle opens the event
        const box = card.current.getBoundingClientRect();
        const at = ((event as PointerEvent).clientX - box.left) / box.width;
        if (at < 0.3 && photos.length > 1) setPhoto((i) => (i - 1 + photos.length) % photos.length);
        else if (at > 0.7 && photos.length > 1) setPhoto((i) => (i + 1) % photos.length);
        else onOpen();
      }}
      style={{ x, y, rotate, zIndex: 10 - depth }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      variants={{
        out: (thrown: Exit | null) =>
          thrown?.slug === row.s
            ? {
                x: thrown.x * 900,
                y: thrown.y * 600,
                rotate: thrown.x * 24,
                opacity: 0,
                transition: { duration: 0.35 },
              }
            : { opacity: 0, transition: { duration: 0.2 } },
      }}
    >
      <img
        key={current.src}
        alt={photos.length > 1 ? `Foto ${photo + 1} de ${photos.length} de ${row.t}` : `Foto de ${row.t}`}
        className="absolute inset-0 size-full object-cover"
        decoding="async"
        draggable={false}
        loading={depth <= 1 ? "eager" : "lazy"}
        sizes={current.sizes}
        src={current.src}
        srcSet={current.srcSet}
      />
      {photos.length > 1 ? (
        <div className="absolute inset-x-3 top-3 flex items-center gap-1">
          {photos.length <= BARS ? (
            photos.map((src, i) => (
              <span key={src} className={cn("h-1 flex-1 rounded-full", i === photo ? "bg-white" : "bg-white/35")} />
            ))
          ) : (
            <span className="ml-auto rounded-full bg-black/55 px-2 py-0.5 font-terminal text-[11px] text-white tabular-nums">
              {photo + 1}/{photos.length}
            </span>
          )}
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-5 pt-28 pb-5">
        <p className="font-terminal text-[12px] text-zinc-300">
          {formatDate({ start: row.d, end: row.e })} · {KIND_LABEL[row.k]}
        </p>
        <h2 className="mt-1 font-title text-2xl leading-tight font-bold text-white">{row.t}</h2>
        <p className="mt-1 text-[14px] text-zinc-300">
          {community?.name ?? row.c}
          {row.v ? <span className="text-zinc-400"> · {row.v}</span> : null}
        </p>
        {summary ? <p className="mt-2 line-clamp-3 text-[14px] leading-snug text-zinc-200">{summary}</p> : null}
      </div>
    </m.article>
  );
}

/* ---------------------------------------------------------------- the deck */

function DeckView() {
  const data = useArchiveData(true);
  const [state, set] = useArchiveFilters();
  const wide = useWide();
  const communities = useMemo(() => data?.communities ?? [], [data]);
  const byCommunity = useMemo(() => new Map(communities.map((c) => [c.slug, c])), [communities]);
  const range = useMemo((): [number, number] => {
    const years = (data?.rows ?? []).map((row) => Number(row.d.slice(0, 4)));
    return years.length ? [Math.min(...years), Math.max(...years)] : [2007, 2026];
  }, [data]);

  // Events with something to look at and something to read; the search box isn't part of the deck
  const cards = useMemo(
    () =>
      data
        ? filterRows(data.rows, { ...state, q: "" }, byCommunity).filter((row) => row.k !== "hito" && row.i && row.l)
        : [],
    // oxlint-disable-next-line react/exhaustive-deps -- the selected event and the order aren't the deck's
    [
      data,
      byCommunity,
      state.comunidad,
      state.tipo,
      state.tema,
      state.ciudad,
      state.desde,
      state.hasta,
      state.online,
      state.ecosistema,
    ]
  );
  const key = JSON.stringify([
    state.comunidad,
    state.tipo,
    state.tema,
    state.ciudad,
    state.desde,
    state.hasta,
    state.online,
    state.ecosistema,
  ]);

  // The seed and the place survive a visit to an event and back (same filters, same session)
  const [seed, setSeed] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as {
      seed: number;
      index: number;
      key: string;
    } | null;
    setSeed(saved?.seed ?? Math.floor(Math.random() * 2 ** 31));
    setIndex(saved?.key === key ? saved.index : 0);
  }, [key]);
  useEffect(() => {
    if (seed !== null) sessionStorage.setItem(STORE, JSON.stringify({ seed, index, key }));
  }, [seed, index, key]);
  const deck = useMemo(() => (seed === null ? [] : shuffled(cards, seed)), [cards, seed]);

  const [exit, setExit] = useState<Exit | null>(null);
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const row = deck[index];

  const next = (direction = { x: -1, y: 0 }) => {
    if (!row) return;
    setExit({ slug: row.s, ...direction });
    setIndex((i) => Math.min(i + 1, deck.length));
  };
  const back = () => {
    setExit(null);
    setIndex((i) => Math.max(i - 1, 0));
  };
  const reshuffle = () => {
    setExit(null);
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setIndex(0);
  };

  // ←/→ on a keyboard, Enter for the whole event
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (open || filtersOpen || (event.target as Element).closest("input, textarea, select, [role=dialog]")) return;
      if (event.key === "ArrowRight") next({ x: 1, y: 0 });
      else if (event.key === "ArrowLeft") back();
      else if (event.key === "Enter" && row) setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const neighbour = (r?: ArchiveRow): Neighbour => (r ? { slug: r.s, title: r.t, start: r.d } : undefined);
  const filtersOn = activeCount(state) - (state.q ? 1 : 0);

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pt-3 pb-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-[14px] text-zinc-300 hover:text-white"
          href="/timeline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Historia
        </Link>
        <p aria-live="polite" className="font-terminal text-[12px] text-zinc-400 tabular-nums">
          {deck.length ? `${number.format(Math.min(index + 1, deck.length))} / ${number.format(deck.length)}` : ""}
        </p>
        <button
          className="relative inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[13px] text-zinc-200 hover:border-white/25"
          onClick={() => setFiltersOpen(true)}
          type="button"
        >
          <SlidersHorizontal aria-hidden className="size-3.5" /> Filtros
          {filtersOn > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-yellow-400 text-[11px] font-semibold text-zinc-950">
              {filtersOn}
            </span>
          ) : null}
        </button>
      </div>

      <div className="relative mt-3 min-h-0 flex-1">
        {!data || seed === null ? (
          <div aria-busy className="absolute inset-0 animate-pulse rounded-3xl bg-white/[0.05]" />
        ) : !deck.length ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-white/15 p-8 text-center">
            <p className="text-zinc-300">No hay eventos con fotos para esos filtros.</p>
            <button
              className="text-sm text-yellow-300 underline underline-offset-4"
              onClick={() => void set(null)}
              type="button"
            >
              Sacar los filtros
            </button>
          </div>
        ) : index >= deck.length ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="font-title text-2xl font-bold text-white">Los viste todos</p>
            <p className="text-zinc-400">{number.format(deck.length)} eventos de la historia de la comunidad.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-yellow-300"
                onClick={reshuffle}
                type="button"
              >
                <Shuffle aria-hidden className="size-4" /> Mezclar de nuevo
              </button>
              <Link
                className="inline-flex h-10 items-center rounded-full border border-white/15 px-5 text-sm text-zinc-200"
                href="/timeline#archivo"
              >
                Ir al archivo
              </Link>
            </div>
          </div>
        ) : (
          <AnimatePresence custom={exit} initial={false}>
            {deck
              .slice(index, index + 3)
              .map((card, depth) => (
                <Card
                  key={card.s}
                  community={byCommunity.get(card.c)}
                  depth={depth}
                  onOpen={() => setOpen(true)}
                  onThrow={(direction) => next(direction)}
                  row={card}
                />
              ))
              .toReversed()}
          </AnimatePresence>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          aria-label="El anterior"
          className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition-colors hover:border-white/25 disabled:opacity-40"
          disabled={index === 0}
          onClick={back}
          type="button"
        >
          <Undo2 className="size-5" />
        </button>
        <button
          aria-label="Ver el evento"
          className="flex size-14 items-center justify-center rounded-full bg-white text-zinc-950 transition-colors hover:bg-yellow-300 disabled:opacity-40"
          disabled={!row}
          onClick={() => setOpen(true)}
          type="button"
        >
          <Info className="size-6" />
        </button>
        <button
          aria-label="El siguiente"
          className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition-colors hover:border-white/25 disabled:opacity-40"
          disabled={!row}
          onClick={() => next({ x: 1, y: 0 })}
          type="button"
        >
          <ArrowRight className="size-5" />
        </button>
      </div>
      <p className="mt-3 text-center text-[12px] text-zinc-400">
        Deslizá para pasar · tocá los costados para ver más fotos
      </p>

      {/* The whole event, as the archive shows it; its arrows walk the deck */}
      <Sheet onOpenChange={setOpen} open={open && Boolean(row)}>
        <SheetContent
          className={cn(
            "gap-0 overflow-y-auto border-white/10 bg-zinc-950 px-5 pt-10 pb-0 outline-none",
            // From the side it reaches the top of the screen: above the navbar (z-60), not under it
            wide ? "z-[70] w-[28rem] sm:max-w-[28rem]" : "h-[88dvh]"
          )}
          data-reader
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          side={wide ? "right" : "bottom"}
        >
          <SheetTitle className="sr-only">{row?.t ?? "Evento"}</SheetTitle>
          <SheetDescription className="sr-only">El evento completo, con sus fotos y su historia</SheetDescription>
          {row ? (
            <EventPanel
              direction={1}
              next={neighbour(deck[index + 1])}
              onMove={(slug, direction) => {
                setExit(null);
                setIndex((i) => (deck[i + direction]?.s === slug ? i + direction : i));
              }}
              position={`${number.format(index + 1)} de ${number.format(deck.length)}`}
              preview={{ row, community: byCommunity.get(row.c) }}
              previous={neighbour(deck[index - 1])}
              slug={row.s}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet onOpenChange={setFiltersOpen} open={filtersOpen}>
        <SheetContent className="max-h-[85dvh] overflow-y-auto border-white/10 bg-zinc-950" side="bottom">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>{number.format(deck.length)} eventos con fotos para mirar</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-5">
            <CommunityPicker communities={communities} set={set} state={state} />
            <MoreFilters communities={communities} range={range} rows={data?.rows ?? []} set={set} state={state} />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 text-sm text-zinc-200"
              onClick={() => {
                reshuffle();
                setFiltersOpen(false);
              }}
              type="button"
            >
              <Shuffle aria-hidden className="size-4" /> Mezclar de nuevo
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The URL holds the filters (the archive's own); the adapter lives with the only code that reads them */
export default function Deck() {
  return (
    <NuqsAdapter>
      <DeckView />
    </NuqsAdapter>
  );
}
