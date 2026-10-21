"use client";

import { Search, X } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { cn } from "app/lib/utils";

export type FilterableTalk = { slug: string; text: string; event: string; topics: string[]; hasVideo: boolean };
type Option = { value: string; label: string };

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const FilterContext = createContext<{ visible: Set<string> | null }>({ visible: null });

type State = { query: string; event: string; topic: string; withVideo: boolean };
const EMPTY: State = { query: "", event: "", topic: "", withVideo: false };

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

  const chip = (selected: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors",
      selected
        ? "border-yellow-400/40 bg-yellow-400/[0.08] text-yellow-300"
        : "border-line text-zinc-400 hover:border-line-strong hover:text-zinc-100"
    );

  return (
    <FilterContext.Provider value={{ visible }}>
      <div className="mb-10 flex flex-col gap-4 rounded-xl border border-line bg-ink-elev/60 p-4 sm:p-5">
        <label className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.02] px-3.5 focus-within:border-line-strong">
          <Search aria-hidden className="size-4 shrink-0 text-zinc-500" />
          <span className="sr-only">Buscar charlas</span>
          <input
            className="h-11 w-full bg-transparent text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600"
            placeholder="Buscá por título, speaker o tema…"
            type="search"
            value={state.query}
            onChange={(event) => set({ query: event.target.value })}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por evento">
          <button
            aria-pressed={!state.event}
            className={chip(!state.event)}
            type="button"
            onClick={() => set({ event: "" })}
          >
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
              className={cn(chip(state.topic !== ""), "appearance-none bg-transparent pr-8")}
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
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-zinc-500"
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
            ▶ Con video
          </button>
          <p aria-live="polite" className="ml-auto font-terminal text-[11px] text-zinc-500">
            {visible ? `${visible.size} de ${talks.length} charlas` : `${talks.length} charlas`}
          </p>
          {active ? (
            <button
              className="inline-flex items-center gap-1 font-terminal text-[11px] text-zinc-400 hover:text-zinc-100"
              type="button"
              onClick={() => setState(EMPTY)}
            >
              <X aria-hidden className="size-3" /> Limpiar
            </button>
          ) : null}
        </div>
      </div>
      {children}
      {visible?.size === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-6 py-14 text-center text-sm text-zinc-500">
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
