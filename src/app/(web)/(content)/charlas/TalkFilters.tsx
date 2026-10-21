"use client";

import { Play, Search, X } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { cn } from "app/lib/utils";

export type FilterableTalk = { slug: string; text: string; event: string; topics: string[]; hasVideo: boolean };
type Option = { value: string; label: string };

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const FilterContext = createContext<{ visible: Set<string> | null }>({ visible: null });

type State = { query: string; event: string; topic: string; withVideo: boolean };
const EMPTY: State = { query: "", event: "", topic: "", withVideo: false };

const chip = (selected: boolean) =>
  cn(
    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors",
    selected
      ? "border-yellow-400 bg-yellow-400 text-zinc-950"
      : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
  );

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
      <div className="mb-12 flex flex-col gap-4">
        <label className="relative block w-full max-w-xl">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-500" />
          <span className="sr-only">Buscar charlas</span>
          <input
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-10 pl-11 text-[15px] text-white transition-colors outline-none placeholder:text-zinc-500 focus:border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/20"
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
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por evento">
          <button aria-pressed={!state.event} className={chip(!state.event)} type="button" onClick={() => set({ event: "" })}>
            Todos los eventos
          </button>
          {events.map(({ value, label }) => (
            <button
              key={value}
              aria-pressed={state.event === value}
              className={chip(state.event === value)}
              type="button"
              onClick={() => set({ event: state.event === value ? "" : value })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Tema</span>
            <select
              className={cn(chip(state.topic !== ""), "appearance-none pr-8")}
              value={state.topic}
              onChange={(event) => set({ topic: event.target.value })}
            >
              <option value="">Todos los temas</option>
              {topics.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[10px]",
                state.topic ? "text-zinc-800" : "text-zinc-500"
              )}
            >
              ▾
            </span>
          </label>
          <button
            aria-pressed={state.withVideo}
            className={chip(state.withVideo)}
            type="button"
            onClick={() => set({ withVideo: !state.withVideo })}
          >
            <Play aria-hidden className="size-3 fill-current" /> Con video
          </button>
          <p aria-live="polite" className="ml-auto text-[13px] text-zinc-500 tabular-nums">
            {visible ? `${visible.size} de ${talks.length} charlas` : `${talks.length} charlas`}
          </p>
          {active ? (
            <button
              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              type="button"
              onClick={() => setState(EMPTY)}
            >
              <X aria-hidden className="size-3.5" /> Limpiar
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

  return <div hidden={visible ? !visible.has(slug) : undefined}>{children}</div>;
}

/** A group (one event) that hides when none of its talks match */
export function FilterGroup({ slugs, children }: { slugs: string[]; children: ReactNode }) {
  const { visible } = useContext(FilterContext);

  return <div hidden={visible ? !slugs.some((slug) => visible.has(slug)) : undefined}>{children}</div>;
}
