"use client";

import { Camera, MousePointerClick, Sparkles } from "lucide-react";
import { m } from "motion/react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "app/lib/utils";
import { Kbd } from "components/community/ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "components/shared/ui/sheet";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "components/shared/ui/timeline";
import type { ArchiveRow } from "lib/timeline/data";
import { formatDate, KIND_LABEL } from "lib/timeline/format";
import { thumbSources } from "lib/timeline/image";
import type { TimelineKind } from "lib/timeline/types";

import { type ArchiveCommunity, settleOn, takeReturn, useArchiveData, useNear } from "./archive-data";
import EventPanel from "./EventPanel";
import Filters from "./Filters";
import { filterRows, sortRows, useArchiveFilters } from "./filter-state";

const BIG = new Set<TimelineKind>(["conferencia", "hackaton", "jam"]);
const number = new Intl.NumberFormat("es-UY");
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Rows a year (or the ranked list) shows before "Ver más", and their height before they render */
const FIRST = 40;
const ROW_PX = 96;
const MONTH_PX = 44;

const useDesktop = () =>
  useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(min-width: 1024px)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  );

type Year = readonly [string, ArchiveRow[]];

const groupByYear = (rows: ArchiveRow[]): Year[] => {
  const groups = new Map<string, ArchiveRow[]>();
  for (const row of rows) {
    const year = row.d.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), row]);
  }
  return [...groups];
};

/**
 * Every event, filterable, read without leaving the list: on large screens the selected event
 * opens in a panel beside it (↑/↓ walk the list), on phones in a sheet you can swipe through.
 * Rows load when the archive gets near the screen and each year renders when it does, so the
 * page stays light whatever the size of the history. All of it lives in the URL.
 */
export default function Archive() {
  const [root, rootNear] = useNear<HTMLDivElement>("1500px");
  // A link straight into the archive (a year, a selected event, filters) can't wait for the
  // reader to scroll near it: its anchor only exists once the rows are in
  const [deepLink, setDeepLink] = useState(false);
  useEffect(() => {
    if (/^#(anio-|archivo)/.test(location.hash) || location.search) setDeepLink(true);
    const onHash = () => {
      const hash = location.hash.slice(1);
      if (!/^(anio-|archivo)/.test(hash)) return;
      setDeepLink(true);
      if (document.getElementById(hash)) settleOn(hash);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const data = useArchiveData(rootNear || deepLink);
  const [state, set] = useArchiveFilters();
  const query = useDeferredValue(state.q);
  const desktop = useDesktop();
  const { rows, communities } = data ?? { rows: [], communities: [] };
  const byCommunity = useMemo(() => new Map(communities.map((c) => [c.slug, c])), [communities]);
  const range = useMemo((): [number, number] => {
    const years = rows.map((row) => Number(row.d.slice(0, 4)));
    return years.length ? [Math.min(...years), Math.max(...years)] : [2007, 2026];
  }, [rows]);

  const filtered = useMemo(
    () => filterRows(rows, { ...state, q: query }, byCommunity),
    // Every filter but the selected event and the order
    // oxlint-disable-next-line react/exhaustive-deps
    [
      rows,
      byCommunity,
      query,
      state.comunidad,
      state.tipo,
      state.tema,
      state.ciudad,
      state.desde,
      state.hasta,
      state.fotos,
      state.online,
      state.ecosistema,
    ]
  );
  const ordered = useMemo(() => sortRows(filtered, state.orden), [filtered, state.orden]);
  const chronological = state.orden === "antiguos" || state.orden === "recientes";
  const years = useMemo(() => (chronological ? groupByYear(ordered) : []), [ordered, chronological]);
  const filterKey = [
    query,
    state.comunidad,
    state.tipo,
    state.tema,
    state.ciudad,
    state.desde,
    state.hasta,
    state.fotos,
    state.online,
    state.ecosistema,
    state.orden,
  ].join("|");

  /* ------------------------------------------------------------ selection */
  const selected = state.evento;
  const index = selected ? ordered.findIndex((row) => row.s === selected) : -1;
  const indexRef = useRef(index);
  indexRef.current = index;
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const [direction, setDirection] = useState(1);

  const select = useCallback(
    (slug: string | null, dir?: number) => {
      const target = slug ? orderedRef.current.findIndex((row) => row.s === slug) : -1;
      setDirection(dir ?? (target >= indexRef.current ? 1 : -1));
      void set({ evento: slug });
    },
    [set]
  );

  const move = useCallback(
    (by: number) => {
      const target = orderedRef.current[indexRef.current + by];
      if (!target) return;
      select(target.s, by);
      // The row follows the selection (and takes the focus, so ↑/↓ keep working)
      requestAnimationFrame(() => {
        const row = document.getElementById(`e-${target.s}`);
        row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        row?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      });
    },
    [select]
  );

  // Arriving with a selected event, a #anio-YYYY, or back from an event page: go there once rows are in
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const slug = takeReturn() ?? (state.evento || null);
    if (slug) {
      setReturnTo(slug);
      requestAnimationFrame(() => settleOn(`e-${slug}`, "center"));
      return;
    }
    const hash = location.hash.slice(1);
    if (/^(anio-|archivo)/.test(hash)) requestAnimationFrame(() => settleOn(hash));
    // Once, when the rows arrive
    // oxlint-disable-next-line react/exhaustive-deps
  }, [data]);

  const focus = selected || returnTo;
  const toNeighbour = (row?: ArchiveRow) => (row ? { slug: row.s, title: row.t, start: row.d } : undefined);
  const position = index >= 0 ? `${number.format(index + 1)} de ${number.format(ordered.length)}` : "";

  // Each event is read from its top (in the side panel and in the phone's sheet)
  useEffect(() => {
    for (const reader of document.querySelectorAll("[data-reader]")) reader.scrollTo({ top: 0 });
  }, [selected]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as Element).closest("input, textarea, select, [role=combobox], [role=dialog]")) return;
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Escape" && selected) {
      select(null);
    }
  };

  const panel =
    selected && index >= 0 ? (
      <EventPanel
        direction={direction}
        next={toNeighbour(ordered[index + 1])}
        onMove={(slug, dir) => {
          select(slug, dir);
          requestAnimationFrame(() =>
            document.getElementById(`e-${slug}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
          );
        }}
        position={position}
        previous={toNeighbour(index > 0 ? ordered[index - 1] : undefined)}
        slug={selected}
      />
    ) : null;

  return (
    <div ref={root}>
      <Filters
        communities={communities}
        range={range}
        rows={rows}
        set={set}
        state={state}
        total={data ? ordered.length : 0}
      />

      {!data ? (
        <div aria-busy className="mt-8 flex flex-col gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : ordered.length ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[4rem_minmax(0,1fr)_minmax(0,26rem)]">
          {chronological ? <YearIndex years={years} /> : <span className="hidden xl:block" />}

          {/* --------------------------------------------------------- list */}
          <div className="min-w-0" onKeyDown={onKeyDown} role="presentation">
            {chronological ? (
              <div className="flex flex-col gap-12">
                {years.map(([year, items]) => (
                  // A new filter starts every year folded again
                  <YearSection
                    key={`${year}|${filterKey}`}
                    focus={focus}
                    items={items}
                    names={byCommunity}
                    onSelect={select}
                    selected={selected}
                    year={year}
                  />
                ))}
              </div>
            ) : (
              <Ranked
                key={filterKey}
                focus={focus}
                items={ordered}
                names={byCommunity}
                onSelect={select}
                selected={selected}
                sort={state.orden}
              />
            )}
          </div>

          {/* -------------------------------------------- the reading panel */}
          <aside aria-label="El evento elegido" className="hidden lg:block">
            <div
              className="sticky top-[8.5rem] max-h-[calc(100dvh-9.5rem)] [scrollbar-width:thin] overflow-y-auto rounded-2xl border border-white/[0.08] bg-zinc-950/60 px-5 pt-5"
              data-reader
            >
              {panel ?? (
                <div className="pb-5">
                  <Overview communities={byCommunity} rows={ordered} />
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <p className="mt-10 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center text-zinc-400">
          Nada con esos filtros. ¿Te acordás de un evento que falta?{" "}
          <a className="text-yellow-300 underline underline-offset-4" href="#sumar">
            Contanos
          </a>
          .
        </p>
      )}

      {/* Phones: the selected event in a sheet; swipe sideways for the next or previous one */}
      <Sheet onOpenChange={(open) => !open && select(null)} open={!desktop && Boolean(panel)}>
        <SheetContent
          className="h-[88dvh] gap-0 overflow-y-auto border-white/10 bg-zinc-950 px-5 pt-10 pb-0 outline-none"
          data-reader
          // The sheet itself takes the focus: its first button is "Anterior" while the event loads
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          side="bottom"
        >
          <SheetTitle className="sr-only">Evento</SheetTitle>
          <SheetDescription className="sr-only">
            Deslizá a los costados para ver el anterior o el siguiente
          </SheetDescription>
          <SwipeArea onSwipe={(by) => move(by)}>{panel}</SwipeArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SwipeArea({ children, onSwipe }: { children: React.ReactNode; onSwipe: (by: number) => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="h-full touch-pan-y"
      onPointerDown={(event) => {
        start.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        start.current = null;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- year index */

/** A sticky column of years beside the list (xl): the one being read is lit; a click jumps */
function YearIndex({ years }: { years: Year[] }) {
  const [active, setActive] = useState("");
  const busiest = Math.max(1, ...years.map(([, items]) => items.length));

  useEffect(() => {
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id.slice(5), entry.isIntersecting);
        const first = years.find(([year]) => visible.get(year));
        if (first) setActive(first[0]);
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    for (const [year] of years) {
      const element = document.getElementById(`anio-${year}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [years]);

  return (
    <nav aria-label="Años del archivo" className="hidden xl:block">
      <ol className="sticky top-[8.5rem] flex max-h-[calc(100dvh-9.5rem)] [scrollbar-width:none] flex-col gap-0.5 overflow-y-auto">
        {years.map(([year, items]) => (
          <li key={year}>
            <button
              aria-current={active === year ? "location" : undefined}
              className={cn(
                "group relative flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-terminal text-[12px] tabular-nums transition-colors",
                active === year ? "text-yellow-300" : "text-zinc-400 hover:text-zinc-100"
              )}
              onClick={() => settleOn(`anio-${year}`)}
              type="button"
            >
              {active === year ? (
                <m.span
                  layoutId="year-index"
                  className="absolute inset-0 rounded-md bg-yellow-400/10"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              ) : null}
              <span className="relative">{year}</span>
              <span
                aria-hidden
                className="relative ml-auto h-1 rounded-full bg-[#b8860b]/70"
                style={{ width: `${4 + (items.length / busiest) * 18}px` }}
              />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ---------------------------------------------------------------- the list */

type ListProps = {
  names: Map<string, ArchiveCommunity>;
  selected: string;
  focus: string | null;
  onSelect: (slug: string | null) => void;
};

/**
 * A year: its header right away, its rows (by month, with the month pinned while you read it)
 * once it gets near the screen. A placeholder of about the same height holds its place before.
 */
function YearSection({
  year,
  items,
  names,
  selected,
  focus,
  onSelect,
}: ListProps & { year: string; items: ArchiveRow[] }) {
  const [ref, near] = useNear<HTMLElement>("800px");
  const focusIndex = focus ? items.findIndex((row) => row.s === focus) : -1;
  const [limit, setLimit] = useState(FIRST);
  // The selected row is always rendered, however far down its year it is
  const shown = items.slice(0, Math.max(limit, focusIndex + 10));
  const rendered = near || focusIndex >= 0;
  const months = useMemo(() => {
    const groups = new Map<string, ArchiveRow[]>();
    for (const row of shown) {
      const month = row.d.slice(5, 7) || "00";
      groups.set(month, [...(groups.get(month) ?? []), row]);
    }
    return [...groups];
  }, [shown]);

  return (
    <section ref={ref} aria-labelledby={`anio-${year}-h`} className="scroll-mt-36" id={`anio-${year}`}>
      <h3
        className="flex items-baseline gap-3 border-b border-white/[0.08] pb-3 font-title text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
        id={`anio-${year}-h`}
      >
        {year}
        <span className="font-sans text-sm font-normal tracking-normal text-zinc-400">
          {number.format(items.length)} {items.length === 1 ? "evento" : "eventos"}
        </span>
      </h3>
      {rendered ? (
        <>
          {months.map(([month, rows]) => (
            <div key={month}>
              <p className="sticky top-[8.3rem] z-10 -mx-2 mt-4 mb-2 bg-zinc-950/90 px-2 py-1.5 text-[12px] font-medium tracking-wide text-zinc-400 uppercase backdrop-blur">
                {month === "00" ? "Sin mes" : MONTHS[Number(month) - 1]}
                <span className="ml-2 font-terminal tracking-normal normal-case">{rows.length}</span>
              </p>
              {/* No step is "completed": the rail stays a quiet hairline */}
              <Timeline value={0}>
                {rows.map((row, i) => (
                  <Row
                    key={row.s}
                    delay={Math.min(i, 10) * 0.025}
                    name={names.get(row.c)?.name ?? row.c}
                    onSelect={onSelect}
                    row={row}
                    selected={row.s === selected}
                  />
                ))}
              </Timeline>
            </div>
          ))}
          {items.length > shown.length ? (
            <button
              className="mt-4 ml-10 inline-flex h-9 items-center rounded-full border border-white/10 px-4 text-sm text-zinc-300 transition-colors hover:border-yellow-400/40 hover:text-white"
              onClick={() => setLimit(shown.length + 120)}
              type="button"
            >
              Ver {Math.min(120, items.length - shown.length)} más de {year}
            </button>
          ) : null}
        </>
      ) : (
        <div
          aria-hidden
          style={{ height: Math.min(items.length, FIRST) * ROW_PX + Math.min(12, items.length) * MONTH_PX }}
        />
      )}
    </section>
  );
}

/** Ranked by attendance or by photos: one list with its place on each row */
function Ranked({ items, names, selected, focus, onSelect, sort }: ListProps & { items: ArchiveRow[]; sort: string }) {
  const focusIndex = focus ? items.findIndex((row) => row.s === focus) : -1;
  const [limit, setLimit] = useState(60);
  const shown = items.slice(0, Math.max(limit, focusIndex + 10));

  return (
    <div>
      <Timeline value={0}>
        {shown.map((row, i) => (
          <Row
            key={row.s}
            delay={Math.min(i, 10) * 0.025}
            name={names.get(row.c)?.name ?? row.c}
            onSelect={onSelect}
            rank={i + 1}
            row={row}
            selected={row.s === selected}
            stat={sort === "fotos" ? `${number.format(row.n ?? 0)} fotos` : `${number.format(row.r ?? 0)} anotados`}
          />
        ))}
      </Timeline>
      {items.length > shown.length ? (
        <button
          className="mt-4 ml-10 inline-flex h-9 items-center rounded-full border border-white/10 px-4 text-sm text-zinc-300 transition-colors hover:border-yellow-400/40 hover:text-white"
          onClick={() => setLimit(shown.length + 120)}
          type="button"
        >
          Ver {Math.min(120, items.length - shown.length)} más
        </button>
      ) : null}
    </div>
  );
}

function RowView({
  row,
  name,
  selected,
  onSelect,
  delay,
  rank,
  stat,
}: {
  row: ArchiveRow;
  name: string;
  selected: boolean;
  onSelect: (slug: string | null) => void;
  delay: number;
  rank?: number;
  stat?: string;
}) {
  const thumb = row.i ? thumbSources(row.i, 72) : null;

  return (
    <TimelineItem
      // Room above and below when ↑/↓ scroll a row into view: it never lands under the headers or on the edge
      className="scroll-mt-48 scroll-mb-24 group-data-[orientation=vertical]/timeline:ms-10 group-data-[orientation=vertical]/timeline:not-last:pb-2"
      id={`e-${row.s}`}
      step={1}
    >
      <TimelineSeparator className="bg-white/10 group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem)] group-data-[orientation=vertical]/timeline:translate-y-5" />
      <TimelineIndicator
        className={cn(
          "size-3 rounded-full border-0 bg-zinc-800 ring-1 ring-white/20 transition-transform group-data-[orientation=vertical]/timeline:top-4 group-data-[orientation=vertical]/timeline:-left-7",
          BIG.has(row.k) && "bg-[#b8860b] ring-[#b8860b]/50",
          row.k === "hito" && "bg-yellow-400 ring-yellow-300",
          selected && "scale-125 bg-yellow-400 ring-yellow-300"
        )}
      />
      <m.button
        animate={{ opacity: 1, y: 0 }}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-4 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:outline-none",
          selected ? "bg-yellow-400/[0.07] ring-1 ring-yellow-400/40" : "hover:bg-white/[0.035]"
        )}
        initial={{ opacity: 0, y: 6 }}
        onClick={() => onSelect(selected ? null : row.s)}
        transition={{ delay, duration: 0.3 }}
        type="button"
      >
        <TimelineHeader className="min-w-0 flex-1">
          <TimelineDate className="font-terminal text-[12px] font-normal text-zinc-400">
            {rank ? <span className="mr-2 text-yellow-300">#{rank}</span> : null}
            {formatDate({ start: row.d, end: row.e })}
            <span className="ml-2">· {KIND_LABEL[row.k]}</span>
            {row.x ? <span className="ml-2">· Ecosistema</span> : null}
            {row.o ? <span className="ml-2">· Online</span> : null}
          </TimelineDate>
          <TimelineTitle
            className={cn("text-[15px] leading-snug font-semibold", selected ? "text-yellow-100" : "text-zinc-100")}
          >
            {row.t}
          </TimelineTitle>
          <TimelineContent className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-400">
            <span className="text-zinc-300">{name}</span>
            {stat ? <span className="text-yellow-200">{stat}</span> : null}
            {row.v ? <span className="max-w-[16rem] truncate">{row.v}</span> : null}
            {row.r && !stat ? <span>{number.format(row.r)} anotados</span> : null}
            {row.n ? (
              <span className="inline-flex items-center gap-1">
                <Camera aria-hidden className="size-3.5" /> {number.format(row.n)}
              </span>
            ) : null}
            {row.h ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/10 px-2 py-0.5 text-[12px] text-yellow-200">
                <Sparkles aria-hidden className="size-3" /> {row.h}
              </span>
            ) : null}
          </TimelineContent>
        </TimelineHeader>
        {thumb ? (
          // The cover at thumbnail size, straight from Meetup's or Flickr's own small sizes
          <img
            alt=""
            className="hidden h-[54px] w-[72px] shrink-0 rounded-lg bg-zinc-900 object-cover ring-1 ring-white/10 sm:block"
            decoding="async"
            height={54}
            loading="lazy"
            src={thumb.src}
            srcSet={thumb.srcSet}
            width={72}
          />
        ) : null}
      </m.button>
    </TimelineItem>
  );
}

const Row = memo(RowView);

/* ----------------------------------------------------------- the overview */

/** What the panel shows before an event is chosen: the current selection in numbers */
function Overview({ rows, communities }: { rows: ArchiveRow[]; communities: Map<string, ArchiveCommunity> }) {
  const stats = useMemo(() => {
    const perCommunity = new Map<string, number>();
    const perYear = new Map<string, number>();
    let rsvps = 0;
    let photos = 0;
    for (const row of rows) {
      perCommunity.set(row.c, (perCommunity.get(row.c) ?? 0) + 1);
      perYear.set(row.d.slice(0, 4), (perYear.get(row.d.slice(0, 4)) ?? 0) + 1);
      rsvps += row.r ?? 0;
      photos += row.n ?? 0;
    }
    const years = [...perYear.keys()].toSorted();
    const busiest = [...perYear].toSorted((a, b) => b[1] - a[1])[0];
    return {
      communities: perCommunity.size,
      top: [...perCommunity].toSorted((a, b) => b[1] - a[1]).slice(0, 5),
      rsvps,
      photos,
      span: years.length ? `${years[0]}–${years.at(-1)}` : "",
      busiest,
    };
  }, [rows]);

  const figures = [
    { label: "eventos", value: rows.length },
    { label: "comunidades", value: stats.communities },
    { label: "anotados", value: stats.rsvps },
    { label: "fotos", value: stats.photos },
  ];

  return (
    <m.div animate={{ opacity: 1 }} className="flex flex-col gap-6" initial={{ opacity: 0 }}>
      <div>
        <p className="text-[12px] font-medium tracking-wide text-zinc-400 uppercase">
          En esta selección · {stats.span}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          {figures.map(({ label, value }, i) => (
            <m.div
              key={label}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-white/[0.03] p-3"
              initial={{ opacity: 0, y: 8 }}
              transition={{ delay: 0.05 * i }}
            >
              <dt className="text-[12px] text-zinc-400">{label}</dt>
              <dd className="font-title text-2xl font-bold text-yellow-400 tabular-nums">{number.format(value)}</dd>
            </m.div>
          ))}
        </dl>
        {stats.busiest ? (
          <p className="mt-3 text-[13px] text-zinc-400">
            El año con más: <span className="text-zinc-200">{stats.busiest[0]}</span>, con{" "}
            {number.format(stats.busiest[1])}.
          </p>
        ) : null}
      </div>
      <div>
        <p className="mb-2 text-[12px] font-medium tracking-wide text-zinc-400 uppercase">Las que más se juntaron</p>
        <ol className="flex flex-col gap-1.5">
          {stats.top.map(([slug, count]) => (
            <li key={slug} className="flex items-center gap-2 text-[14px]">
              <span className="min-w-0 flex-1 truncate text-zinc-200">{communities.get(slug)?.name ?? slug}</span>
              <span
                className="h-1.5 rounded-full bg-[#b8860b]"
                style={{ width: `${(count / (stats.top[0]?.[1] ?? 1)) * 6}rem` }}
              />
              <span className="w-8 text-right font-terminal text-[12px] text-zinc-400 tabular-nums">{count}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-dashed border-white/10 p-3 text-[13px] text-zinc-400">
        <MousePointerClick aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Elegí un evento de la lista para leerlo acá, con sus fotos. Movete con <Kbd>↑</Kbd> <Kbd>↓</Kbd>;{" "}
          <Kbd>Esc</Kbd> lo cierra.
        </span>
      </p>
    </m.div>
  );
}
