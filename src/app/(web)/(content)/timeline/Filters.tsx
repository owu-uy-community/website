"use client";

import {
  ArrowDownUp,
  Check,
  ChevronsUpDown,
  Code2,
  Gamepad2,
  Mic,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";

import { cn } from "app/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "components/shared/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "components/shared/ui/sheet";
import { Slider } from "components/shared/ui/slider";
import { Switch } from "components/shared/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "components/shared/ui/toggle-group";
import { TOPICS, topicLabel } from "lib/community/topics";
import type { ArchiveRow } from "lib/timeline/data";
import { KIND_LABEL, normalize } from "lib/timeline/format";
import type { TimelineKind } from "lib/timeline/types";

import type { ArchiveCommunity } from "./archive-data";
import {
  activeCount,
  type ArchiveFilters,
  CLEARED,
  cityOptions,
  filterRows,
  KINDS,
  type SetArchiveFilters,
  SORT_LABEL,
  SORTS,
  type Sort,
} from "./filter-state";
import { CONTROL_BOX, COUNT_PX, FIELD, FIELD_LABEL, KIND_PILL, Line, SWITCH_ROW } from "./Skeletons";

const KIND_ICON: Record<TimelineKind, ReactNode> = {
  meetup: <Users aria-hidden />,
  conferencia: <Mic aria-hidden />,
  hackaton: <Code2 aria-hidden />,
  taller: <Wrench aria-hidden />,
  jam: <Gamepad2 aria-hidden />,
  hito: <Sparkles aria-hidden />,
};

const ALL = "todas";
const number = new Intl.NumberFormat("es-UY");
const control = cn(CONTROL_BOX, "text-[14px] text-zinc-100 hover:border-white/20 focus-visible:border-yellow-400/50");

type Props = {
  state: ArchiveFilters;
  set: SetArchiveFilters;
  rows: ArchiveRow[];
  communities: ArchiveCommunity[];
  /** First and last year with events */
  range: [number, number];
  total: number;
  /** The rows are still on their way: counts show as bars, not as zeros */
  loading?: boolean;
};

/** Communities, searchable, several at once; the busiest first and the chosen ones on top */
function CommunityPicker({ state, set, communities }: Pick<Props, "state" | "set" | "communities">) {
  const [open, setOpen] = useState(false);
  const chosen = new Set(state.comunidad);
  const ordered = useMemo(
    () =>
      communities.toSorted((a, b) => Number(chosen.has(b.slug)) - Number(chosen.has(a.slug)) || b.events - a.events),
    // Re-sorted when the popover opens, not on every tick, so items don't jump under the pointer
    // oxlint-disable-next-line react/exhaustive-deps
    [communities, open]
  );
  const toggle = (slug: string) =>
    void set({ comunidad: chosen.has(slug) ? state.comunidad.filter((s) => s !== slug) : [...state.comunidad, slug] });
  const label =
    state.comunidad.length === 0
      ? "Todas las comunidades"
      : state.comunidad.length === 1
        ? (communities.find((c) => c.slug === state.comunidad[0])?.name ?? "1 comunidad")
        : `${state.comunidad.length} comunidades`;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          // A combobox doesn't take its name from its text
          aria-label={`Comunidades: ${label}`}
          className={cn(control, "flex w-full items-center justify-between gap-2 px-3.5 sm:w-64")}
          role="combobox"
          type="button"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-zinc-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        {/* Substrings, not cmdk's fuzzy match: "ruby" shouldn't find "woRld Usability Day" */}
        <Command filter={(value, search) => (normalize(value).includes(normalize(search.trim())) ? 1 : 0)}>
          <CommandInput placeholder="Buscá una comunidad…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Ninguna con ese nombre.</CommandEmpty>
            <CommandGroup>
              {ordered.map((community) => (
                <CommandItem key={community.slug} onSelect={() => toggle(community.slug)} value={community.name}>
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded border",
                      chosen.has(community.slug) ? "border-yellow-400 bg-yellow-400 text-zinc-950" : "border-white/25"
                    )}
                  >
                    {chosen.has(community.slug) ? <Check className="size-3" /> : null}
                  </span>
                  <span className={cn("flex-1 truncate", community.status === "cerrada" && "text-zinc-400")}>
                    {community.name}
                  </span>
                  <span className="font-terminal text-[11px] text-zinc-400 tabular-nums">{community.events}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {state.comunidad.length ? (
          <div className="border-t border-white/10 p-2">
            <button
              className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-white/[0.06]"
              onClick={() => void set({ comunidad: null })}
              type="button"
            >
              Quitar las {state.comunidad.length} elegidas
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn(FIELD, className)}>
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={cn(SWITCH_ROW, "cursor-pointer text-zinc-200")} htmlFor={id}>
      <span>
        {label}
        {hint ? <span className="block text-[12px] text-zinc-400">{hint}</span> : null}
      </span>
      <Switch checked={checked} id={id} onCheckedChange={onChange} />
    </label>
  );
}

/** Type, topic, city, years, the switches and the order: inline on large screens, in a sheet on phones */
function MoreFilters({ state, set, rows, range, communities, loading }: Omit<Props, "total">) {
  const cities = useMemo(() => cityOptions(rows), [rows]);
  // How many events each type would add under the other filters: the dead ends show before the click
  const byKind = useMemo(() => {
    const map = new Map(communities.map((c) => [c.slug, c]));
    const counts = new Map<TimelineKind, number>();
    for (const row of filterRows(rows, { ...state, tipo: [] }, map)) counts.set(row.k, (counts.get(row.k) ?? 0) + 1);
    return counts;
  }, [rows, communities, state]);
  const from = state.desde ?? range[0];
  const to = state.hasta ?? range[1];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="flex flex-col gap-5">
        <Field label="Tipo">
          <ToggleGroup
            className="flex-wrap justify-start"
            onValueChange={(value) => void set({ tipo: value.length ? (value as TimelineKind[]) : null })}
            type="multiple"
            value={state.tipo}
          >
            {KINDS.map((kind) => (
              <ToggleGroupItem
                key={kind}
                aria-label={`${KIND_LABEL[kind]}: ${byKind.get(kind) ?? 0}`}
                className={cn(
                  KIND_PILL,
                  "text-zinc-300 data-[state=on]:border-yellow-400/50 data-[state=on]:bg-yellow-400/15 data-[state=on]:text-yellow-200 [&_svg]:size-3.5"
                )}
                disabled={!loading && !byKind.get(kind) && !state.tipo.includes(kind)}
                value={kind}
              >
                {KIND_ICON[kind]}
                {KIND_LABEL[kind]}
                {loading ? (
                  <Line className="animate-pulse font-terminal text-[11px]" w="1.4rem" />
                ) : (
                  <span className="font-terminal text-[11px] tabular-nums opacity-70">
                    {number.format(byKind.get(kind) ?? 0)}
                  </span>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[11rem_11rem_1fr]">
          <Field label="Tema">
            <Select
              onValueChange={(value) => void set({ tema: value === ALL ? null : value })}
              value={state.tema || ALL}
            >
              <SelectTrigger aria-label="Tema" className={control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los temas</SelectItem>
                {TOPICS.map((topic) => (
                  <SelectItem key={topic.value} value={topic.value}>
                    {topic.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ciudad">
            <Select
              onValueChange={(value) => void set({ ciudad: value === ALL ? null : value })}
              value={state.ciudad || ALL}
            >
              <SelectTrigger aria-label="Ciudad" className={control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todo el país</SelectItem>
                {cities.map(({ city, count }) => (
                  <SelectItem key={city} value={city}>
                    {city} <span className="text-zinc-400">· {count}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Años · ${from}–${to}`} className="sm:col-span-2 lg:col-span-1">
            <Slider
              aria-label="Años"
              className="h-10"
              max={range[1]}
              min={range[0]}
              minStepsBetweenThumbs={0}
              onValueChange={([a, b]) =>
                void set({ desde: a === range[0] ? null : a, hasta: b === range[1] ? null : b })
              }
              step={1}
              value={[from, to]}
            />
          </Field>
        </div>
      </div>
      <div className="flex flex-col gap-1 lg:w-60">
        <SwitchRow
          checked={state.fotos}
          id="f-fotos"
          label="Solo con fotos"
          onChange={(value) => void set({ fotos: value || null })}
        />
        <SwitchRow
          checked={state.online}
          id="f-online"
          label="Sumar los online"
          onChange={(value) => void set({ online: value || null })}
        />
        <SwitchRow
          checked={state.ecosistema}
          hint="Empresas, academia, Estado"
          id="f-eco"
          label="Sumar el ecosistema"
          onChange={(value) => void set({ ecosistema: value || null })}
        />
      </div>
    </div>
  );
}

function SortSelect({ state, set }: Pick<Props, "state" | "set">) {
  return (
    <Select
      onValueChange={(value) => void set({ orden: value === "antiguos" ? null : (value as Sort) })}
      value={state.orden}
    >
      <SelectTrigger
        aria-label="Orden"
        className={cn(control, "h-9 w-auto gap-2 border-transparent bg-transparent px-2 text-[13px] text-zinc-300")}
      >
        <ArrowDownUp aria-hidden className="size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SORTS.map((sort) => (
          <SelectItem key={sort} value={sort}>
            {SORT_LABEL[sort]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The filters in use, each removable on its own */
function ActiveChips({ state, set, communities, range }: Omit<Props, "rows" | "total">) {
  const names = new Map(communities.map((c) => [c.slug, c.name]));
  const chips: { key: string; label: string; clear: () => void }[] = [
    ...(state.q ? [{ key: "q", label: `“${state.q}”`, clear: () => void set({ q: null }) }] : []),
    ...state.comunidad.map((slug) => ({
      key: `c-${slug}`,
      label: names.get(slug) ?? slug,
      clear: () => void set({ comunidad: state.comunidad.filter((s) => s !== slug) }),
    })),
    ...state.tipo.map((kind) => ({
      key: `t-${kind}`,
      label: KIND_LABEL[kind],
      clear: () => void set({ tipo: state.tipo.filter((k) => k !== kind) }),
    })),
    ...(state.tema ? [{ key: "tema", label: topicLabel(state.tema), clear: () => void set({ tema: null }) }] : []),
    ...(state.ciudad ? [{ key: "ciudad", label: state.ciudad, clear: () => void set({ ciudad: null }) }] : []),
    ...(state.desde !== null || state.hasta !== null
      ? [
          {
            key: "anios",
            label: `${state.desde ?? range[0]}–${state.hasta ?? range[1]}`,
            clear: () => void set({ desde: null, hasta: null }),
          },
        ]
      : []),
    ...(state.fotos ? [{ key: "fotos", label: "Con fotos", clear: () => void set({ fotos: null }) }] : []),
    ...(state.online ? [{ key: "online", label: "Con online", clear: () => void set({ online: null }) }] : []),
    ...(state.ecosistema ? [{ key: "eco", label: "Con ecosistema", clear: () => void set({ ecosistema: null }) }] : []),
  ];

  return (
    <m.ul layout className="flex flex-wrap items-center gap-2">
      <AnimatePresence initial={false} mode="popLayout">
        {chips.map((chip) => (
          <m.li
            key={chip.key}
            layout
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            initial={{ opacity: 0, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
          >
            <button
              aria-label={`Quitar ${chip.label}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-yellow-400/15 pr-2 pl-3 text-[13px] text-yellow-100 ring-1 ring-yellow-400/30 transition-colors hover:bg-yellow-400/25"
              onClick={chip.clear}
              type="button"
            >
              {chip.label}
              <X aria-hidden className="size-3.5" />
            </button>
          </m.li>
        ))}
        {chips.length > 1 ? (
          <m.li key="clear" layout animate={{ opacity: 1 }} exit={{ opacity: 0 }} initial={{ opacity: 0 }}>
            <button
              className="h-7 px-2 text-[13px] text-zinc-400 underline-offset-4 hover:text-zinc-100 hover:underline"
              onClick={() => void set(CLEARED)}
              type="button"
            >
              Limpiar todo
            </button>
          </m.li>
        ) : null}
      </AnimatePresence>
    </m.ul>
  );
}

export default function Filters(props: Props) {
  const { state, set, total } = props;
  const count = activeCount(state) - state.comunidad.length - (state.q ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Buscar en el archivo</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            className={cn(control, "w-full pr-9 pl-10 placeholder:text-zinc-400 focus:outline-none")}
            onChange={(event) => void set({ q: event.target.value || null })}
            placeholder="Buscá un evento, un lugar, una comunidad…"
            type="search"
            value={state.q}
          />
        </label>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <CommunityPicker communities={props.communities} set={set} state={state} />
          </div>
          {/* Phones: the rest of the filters in a sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <button className={cn(control, "relative flex items-center gap-2 px-3.5 lg:hidden")} type="button">
                <SlidersHorizontal aria-hidden className="size-4" />
                Filtros
                {count ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-yellow-400 text-[11px] font-semibold text-zinc-950">
                    {count}
                  </span>
                ) : null}
              </button>
            </SheetTrigger>
            <SheetContent className="max-h-[85dvh] overflow-y-auto border-white/10 bg-zinc-950" side="bottom">
              <SheetHeader className="mb-4 text-left">
                <SheetTitle>Filtros</SheetTitle>
                <SheetDescription>{number.format(total)} eventos con estos filtros</SheetDescription>
              </SheetHeader>
              <MoreFilters {...props} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <div className="hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 lg:block">
        <MoreFilters {...props} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {props.loading ? (
            <Line className="animate-pulse text-sm" w={COUNT_PX} />
          ) : (
            <p aria-live="polite" className="text-sm text-zinc-300">
              <span className="font-semibold text-white tabular-nums">{number.format(total)}</span>{" "}
              {total === 1 ? "evento" : "eventos"}
              {!state.online ? <span className="text-zinc-400"> · sin los online</span> : null}
            </p>
          )}
          <ActiveChips {...props} />
        </div>
        <SortSelect set={set} state={state} />
      </div>
    </div>
  );
}

export { KIND_ICON };
