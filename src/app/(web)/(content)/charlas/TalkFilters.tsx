"use client";

import { CalendarDays, ChevronDown, Search, Tag, Video, X, type LucideIcon } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { cn } from "app/lib/utils";

export type FilterableTalk = { slug: string; text: string; event: string; topics: string[]; hasVideo: boolean };
type Option = { value: string; label: string };

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const FilterContext = createContext<{ visible: Set<string> | null }>({ visible: null });

type State = { query: string; event: string; topic: string; withVideo: boolean };
const EMPTY: State = { query: "", event: "", topic: "", withVideo: false };

/**
 * A native select with a leading icon. The select itself is invisible and covers the
 * control, so the visible label can be short on phones ("Eventos") and full on desktop
 * ("Todos los eventos") without the browser cutting it off. It lights up while it filters.
 */
function SelectFilter({
  label,
  icon: Icon,
  all,
  short,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  all: string;
  short: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <label
      className={cn(
        "relative flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border pr-9 pl-3.5 text-[14px] transition-colors focus-within:ring-2 focus-within:ring-yellow-400/20 sm:flex-none",
        selected
          ? "border-yellow-400/50 bg-yellow-400/10 text-white"
          : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:text-white"
      )}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", selected ? "text-yellow-400" : "text-zinc-500")} />
      <span aria-hidden className="truncate">
        {selected ? (
          selected.label
        ) : (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{all}</span>
          </>
        )}
      </span>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-zinc-500" />
      <select
        aria-label={label}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Filters the server-rendered archive in place: cards stay server components
 * (children), this only decides which slugs show. `visible` is null while no
 * filter is set, so the first paint is the full archive.
 */
export function TalkFilters({
  talks,
  events,
  topics,
  children,
}: {
  talks: FilterableTalk[];
  events: Option[];
  topics: Option[];
  children: ReactNode;
}) {
  const [state, setState] = useState<State>(EMPTY);
  const set = (patch: Partial<State>) => setState((current) => ({ ...current, ...patch }));

  const active = state.query.trim() !== "" || state.event !== "" || state.topic !== "" || state.withVideo;

  const visible = useMemo(() => {
    if (!active) return null;
    const words = normalize(state.query).split(/\s+/).filter(Boolean);

    return new Set(
      talks
        .filter(
          (talk) =>
            (!state.event || talk.event === state.event) &&
            (!state.topic || talk.topics.includes(state.topic)) &&
            (!state.withVideo || talk.hasVideo) &&
            words.every((word) => talk.text.includes(word))
        )
        .map((talk) => talk.slug)
    );
  }, [active, state, talks]);

  return (
    <FilterContext.Provider value={{ visible }}>
      <div className="mb-12 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block w-full lg:w-auto lg:flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-500"
            />
            <span className="sr-only">Buscar charlas</span>
            <input
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-10 pl-10 text-[15px] text-white transition-colors outline-none placeholder:text-zinc-500 hover:border-white/20 focus:border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/20"
              placeholder="Buscá por título, speaker o tema"
              type="search"
              value={state.query}
              onChange={(event) => set({ query: event.target.value })}
            />
            {state.query ? (
              <button
                aria-label="Borrar búsqueda"
                className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-white"
                type="button"
                onClick={() => set({ query: "" })}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </label>
          <SelectFilter
            all="Todos los eventos"
            icon={CalendarDays}
            short="Eventos"
            label="Evento"
            options={events}
            value={state.event}
            onChange={(event) => set({ event })}
          />
          <SelectFilter
            all="Todos los temas"
            icon={Tag}
            short="Temas"
            label="Tema"
            options={topics}
            value={state.topic}
            onChange={(topic) => set({ topic })}
          />
          {/* Only once some talk has a recording: a toggle that always empties the list helps nobody */}
          {talks.some((talk) => talk.hasVideo) ? (
            <button
              aria-pressed={state.withVideo}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-[14px] font-medium whitespace-nowrap transition-colors",
                state.withVideo
                  ? "border-yellow-400/50 bg-yellow-400/10 text-white"
                  : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:text-white"
              )}
              type="button"
              onClick={() => set({ withVideo: !state.withVideo })}
            >
              <Video aria-hidden className={cn("size-4", state.withVideo ? "text-yellow-400" : "text-zinc-500")} />
              Con video
            </button>
          ) : null}
        </div>
        <div className="flex min-h-7 items-center gap-3 text-[13px] text-zinc-500">
          <p aria-live="polite" className="tabular-nums">
            {visible ? `${visible.size} de ${talks.length} charlas` : `${talks.length} charlas`}
          </p>
          {active ? (
            <button
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              type="button"
              onClick={() => setState(EMPTY)}
            >
              <X aria-hidden className="size-3.5" /> Limpiar filtros
            </button>
          ) : null}
        </div>
      </div>
      {children}
      {visible?.size === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center text-[15px] text-zinc-500">
          Ninguna charla coincide. Probá con otra palabra o limpiá los filtros.
        </p>
      ) : null}
    </FilterContext.Provider>
  );
}

/** A card that hides when the filters leave it out */
export function FilterItem({ slug, children }: { slug: string; children: ReactNode }) {
  const { visible } = useContext(FilterContext);

  return (
    <div className="h-full" hidden={visible ? !visible.has(slug) : undefined}>
      {children}
    </div>
  );
}

/** A group (one event) that hides when none of its talks match */
export function FilterGroup({ slugs, children }: { slugs: string[]; children: ReactNode }) {
  const { visible } = useContext(FilterContext);

  return <div hidden={visible ? !slugs.some((slug) => visible.has(slug)) : undefined}>{children}</div>;
}
