"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Bookmark,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  ExternalLink,
  Info,
  List,
  PartyPopper,
  Sparkles,
  Star,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { MicroLabel, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "components/shared/ui/sheet";
import { useSidebar } from "components/shared/ui/sidebar";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { ToggleGroup, ToggleGroupItem } from "components/shared/ui/toggle-group";
import { addDays, weekdayOf } from "lib/calendar/holidays";
import { itemDays, monthRange, shiftMonth } from "lib/calendar/items";
import { dayKey, shortWhen } from "lib/community/time";
import type { PlanDay, PlanItem } from "lib/orpc/calendar/schemas";
import { orpc } from "lib/orpc/client";

type Level = PlanDay["level"];

export const LEVEL: Record<
  Level,
  { label: string; icon: LucideIcon; tone: string; badge: "success" | "warning" | "destructive" | "secondary" }
> = {
  libre: { label: "Libre", icon: CircleCheck, tone: "text-success", badge: "success" },
  cuidado: { label: "Con cuidado", icon: TriangleAlert, tone: "text-warning", badge: "warning" },
  choca: { label: "Choca", icon: CircleX, tone: "text-live", badge: "destructive" },
  bloqueado: { label: "No disponible", icon: Ban, tone: "text-faint", badge: "secondary" },
};

export const REASON: Record<PlanDay["reasons"][number]["tone"], { icon: LucideIcon; tone: string }> = {
  ok: { icon: CircleCheck, tone: "text-success" },
  info: { icon: Info, tone: "text-muted-foreground" },
  warn: { icon: TriangleAlert, tone: "text-warning" },
  bad: { icon: CircleX, tone: "text-live" },
};

const TIMES = ["18:00", "18:30", "19:00", "19:30", "20:00"];
const DURATIONS = [
  { value: 60, label: "1 h" },
  { value: 90, label: "1 h 30" },
  { value: 120, label: "2 h" },
  { value: 180, label: "3 h" },
  { value: 240, label: "4 h" },
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** What the calendar can hide: holds, holidays, and the big events and periods (CONF, vacations) */
const LAYERS = [
  { value: "reservas", label: "Reservas" },
  { value: "feriados", label: "Feriados" },
  { value: "grandes", label: "Eventos grandes" },
] as const;
type Layer = (typeof LAYERS)[number]["value"];

/** Day keys are calendar days: format them at noon UTC so no timezone moves them. */
const onDay = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-UY", { timeZone: "UTC", ...options }).format(new Date(`${day}T12:00:00Z`));
const longDay = (day: string) => onDay(day, { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
const shortDay = (day: string) =>
  `${onDay(day, { weekday: "short" })} ${Number(day.slice(8))} ${onDay(day, { month: "short" })}`.replaceAll(".", "");
const monthTitle = (month: string) => onDay(`${month}-15`, { month: "long", year: "numeric" });
const clock = (iso: string) =>
  new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

export type CalendarCommunity = { id: string; slug: string; name: string };

/**
 * The shared calendar: a month of days scored for a meetup at the chosen time, every community's
 * events and holds on it, the best days suggested, and a hold one click away.
 */
export function CalendarClient({ community, today }: { community: CalendarCommunity; today: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { isMobile } = useSidebar();

  const month = /^\d{4}-\d{2}$/.test(params.get("mes") ?? "") ? (params.get("mes") as string) : today.slice(0, 7);
  const startTime = TIMES.includes(params.get("hora") ?? "") ? (params.get("hora") as string) : "19:00";
  const durationMin = DURATIONS.some((option) => String(option.value) === params.get("dur"))
    ? Number(params.get("dur"))
    : 120;
  const scope = params.get("alcance") === "audiencia" ? "audiencia" : "todas";
  const selected = params.get("dia");
  /** Dating an existing draft (from Inicio or Eventos) instead of making a new one */
  const draftId = params.get("evento");
  // The month grid, or a list of the days with something on them (the default on phones)
  const view = params.get("vista") === "agenda" || (isMobile && params.get("vista") !== "mes") ? "agenda" : "mes";
  const layers = new Set<Layer>(
    params.has("capas")
      ? LAYERS.map((layer) => layer.value).filter((value) => (params.get("capas") ?? "").split(",").includes(value))
      : LAYERS.map((layer) => layer.value)
  );

  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    // The History API keeps useSearchParams in step without asking the server for the page again
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

  const input = { communityId: community.id, month, startTime, durationMin };
  const plan = useQuery(orpc.calendar.plan.queryOptions({ input, placeholderData: keepPreviousData }));
  const own = useQuery(orpc.events.list.queryOptions({ input: { communityId: community.id } }));

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.calendar.plan.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.events.list.key() }),
    ]);
  const hold = useMutation(
    orpc.events.hold.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Reservaste el ${shortWhen(result.startDate)}`,
          result.headsUp > 0
            ? `Le avisamos a ${result.headsUp === 1 ? "una comunidad" : `${result.headsUp} comunidades`} con público parecido.`
            : "Todas las comunidades la ven por 14 días."
        );
        void invalidate();
      },
      onError: (error) => toast.error("No se pudo reservar", error.message),
    })
  );
  const release = useMutation(
    orpc.events.release.mutationOptions({
      onSuccess: () => {
        toast.success("Liberaste la fecha", "El borrador sigue en Eventos.");
        void invalidate();
      },
      onError: (error) => toast.error("No se pudo liberar", error.message),
    })
  );

  const days = useMemo(() => new Map((plan.data?.days ?? []).map((day) => [day.day, day])), [plan.data]);
  const suggested = useMemo(() => new Set((plan.data?.suggestions ?? []).map((day) => day.day)), [plan.data]);
  const itemsByDay = useMemo(() => {
    const byDay = new Map<string, PlanItem[]>();
    for (const item of plan.data?.items ?? []) {
      if (scope === "audiencia" && !item.related) continue;
      if (!layers.has("reservas") && item.kind === "hold" && !item.own) continue;
      if (!layers.has("grandes") && item.isOwu && !item.own) continue;
      for (const day of itemDays(item.start, item.end, dayKey)) byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }

    return byDay;
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- layers is rebuilt from the URL each render
  }, [plan.data, scope, params.get("capas")]);
  const holdsById = useMemo(
    () => new Map((own.data ?? []).filter((event) => event.heldUntil).map((event) => [event.id, event])),
    [own.data]
  );

  // The grid: whole weeks, Monday first
  const { from, to } = monthRange(month);
  const first = addDays(from, -((weekdayOf(from) + 6) % 7));
  const last = addDays(to, (7 - weekdayOf(to)) % 7);
  const cells: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) cells.push(day);

  const focusDay = useRef<string | null>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (focusDay.current && selected === focusDay.current) {
      cellRefs.current.get(focusDay.current)?.focus();
      focusDay.current = null;
    }
  }, [selected, month]);

  const select = (day: string, focus = false) => {
    if (focus) focusDay.current = day;
    setParams({ dia: day, mes: day.slice(0, 7) });
  };
  const goMonth = (by: number) => setParams({ mes: shiftMonth(month, by), dia: null });

  useShortcuts([
    { id: "calendar.prev", keys: "[", label: "Mes anterior", group: "Calendario", run: () => goMonth(-1) },
    { id: "calendar.next", keys: "]", label: "Mes siguiente", group: "Calendario", run: () => goMonth(1) },
    {
      id: "calendar.today",
      keys: "t",
      label: "Volver a hoy",
      group: "Calendario",
      run: () => setParams({ mes: today.slice(0, 7), dia: today }),
    },
  ]);

  const onGridKey = (event: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!step) return;
    event.preventDefault();
    select(addDays(selected ?? (today.startsWith(month) ? today : from), step), true);
  };

  const draft = draftId ? own.data?.find((event) => event.id === draftId && event.status === "draft") : undefined;
  const detail = selected ? days.get(selected) : undefined;
  const detailItems = selected ? (itemsByDay.get(selected) ?? []) : [];
  const ownHold = selected
    ? (plan.data?.items ?? []).find((item) => item.own && item.kind === "hold" && dayKey(item.start) === selected)
    : undefined;
  const ownEvent = detailItems.find((item) => item.own && item.kind === "event");

  const dayPanel = selected ? (
    <DayDetail
      key={selected}
      inSheet={isMobile}
      busy={hold.isPending || release.isPending}
      day={selected}
      durationMin={durationMin}
      heldUntil={ownHold ? (holdsById.get(ownHold.id)?.heldUntil ?? null) : null}
      items={detailItems}
      ownEvent={ownEvent}
      ownHold={ownHold}
      score={detail}
      startTime={startTime}
      draftName={draft?.name ?? null}
      onHold={(title) =>
        hold.mutate(
          {
            communityId: community.id,
            eventId: draft?.id,
            day: selected,
            startTime,
            durationMin,
            title: title || undefined,
          },
          { onSuccess: () => draft && setParams({ evento: null }) }
        )
      }
      onRelease={(eventId) => release.mutate({ communityId: community.id, eventId })}
      onRenew={(eventId) => hold.mutate({ communityId: community.id, eventId, day: selected, startTime, durationMin })}
    />
  ) : null;

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          <div className="flex items-center gap-1.5">
            <Button aria-label="Mes anterior" size="icon" variant="outline" onClick={() => goMonth(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" onClick={() => setParams({ mes: today.slice(0, 7), dia: today })}>
              Hoy
            </Button>
            <Button aria-label="Mes siguiente" size="icon" variant="outline" onClick={() => goMonth(1)}>
              <ChevronRight />
            </Button>
          </div>
        }
        description="Los eventos y las reservas de todas las comunidades. Elegí horario y te decimos qué día choca menos."
        meta={<span className="font-terminal tabular-nums first-letter:uppercase">{monthTitle(month)}</span>}
        title="Calendario"
      />

      {draft ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-info/40 bg-info-surface px-3 py-2 text-ui text-foreground">
          <Bookmark aria-hidden className="size-4 text-info-foreground" />
          <span className="min-w-0 flex-1 truncate">
            Elegí la fecha de <span className="font-medium">«{draft.name}»</span>
          </span>
          <Button size="xs" variant="ghost" onClick={() => setParams({ evento: null })}>
            Cancelar
          </Button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={startTime} onValueChange={(value) => setParams({ hora: value })}>
          <SelectTrigger aria-label="Hora de inicio" className="w-[104px] font-terminal tabular-nums">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMES.map((time) => (
              <SelectItem key={time} className="font-terminal tabular-nums" value={time}>
                {time}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(durationMin)} onValueChange={(value) => setParams({ dur: value })}>
          <SelectTrigger aria-label="Duración" className="w-[100px] font-terminal tabular-nums">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATIONS.map((option) => (
              <SelectItem key={option.value} className="font-terminal tabular-nums" value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          aria-label="Qué eventos ver"
          className="rounded-md border border-input"
          type="single"
          value={scope}
          onValueChange={(value) => value && setParams({ alcance: value === "todas" ? null : value })}
        >
          <ToggleGroupItem className="h-8 px-3 text-ui" value="todas">
            Todas
          </ToggleGroupItem>
          <ToggleGroupItem className="h-8 px-3 text-ui" value="audiencia">
            Mi audiencia
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          aria-label="Capas"
          className="rounded-md border border-input"
          type="multiple"
          value={[...layers]}
          onValueChange={(value) =>
            setParams({ capas: value.length === LAYERS.length ? null : value.join(",") || "ninguna" })
          }
        >
          {LAYERS.map((layer) => (
            <ToggleGroupItem key={layer.value} className="h-8 px-2.5 text-ui" value={layer.value}>
              {layer.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="Vista"
          className="rounded-md border border-input"
          type="single"
          value={view}
          onValueChange={(value) => value && setParams({ vista: value })}
        >
          <ToggleGroupItem aria-label="Mes" className="h-8 px-2.5" value="mes">
            <CalendarDays aria-hidden className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem aria-label="Agenda" className="h-8 px-2.5" value="agenda">
            <List aria-hidden className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
        <Legend />
      </div>

      {plan.isError ? (
        <ErrorState onRetry={() => void plan.refetch()} title="No pudimos armar el calendario" />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          {view === "agenda" ? (
            <Agenda
              days={(plan.data?.days ?? []).filter((day) => day.day >= from && day.day <= to)}
              itemsByDay={itemsByDay}
              layers={layers}
              loading={!plan.data}
              selected={selected}
              suggested={suggested}
              today={today}
              onSelect={(day) => select(day)}
            />
          ) : (
            <Panel className={cn("overflow-hidden", plan.isPlaceholderData && "opacity-70 transition-opacity")}>
              <div className="grid grid-cols-7 border-b border-border">
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday} className="px-2 py-2">
                    <MicroLabel>{weekday}</MicroLabel>
                  </div>
                ))}
              </div>
              <div aria-label={`Días de ${monthTitle(month)}`} className="grid grid-cols-7" role="group">
                {cells.map((day) => (
                  <DayCell
                    key={day}
                    compact={isMobile}
                    day={day}
                    layers={layers}
                    inMonth={day >= from && day <= to}
                    items={itemsByDay.get(day) ?? []}
                    loading={!plan.data}
                    refCallback={(node) => {
                      if (node) cellRefs.current.set(day, node);
                      else cellRefs.current.delete(day);
                    }}
                    score={days.get(day)}
                    selected={day === selected}
                    suggested={suggested.has(day)}
                    tabbable={day === (selected ?? (today.startsWith(month) ? today : from))}
                    today={day === today}
                    onKeyDown={onGridKey}
                    onSelect={() => select(day)}
                  />
                ))}
              </div>
            </Panel>
          )}

          <div className="flex flex-col gap-4">
            {!isMobile && dayPanel ? <Panel>{dayPanel}</Panel> : null}
            <Suggestions days={plan.data?.suggestions} selected={selected} onPick={(day) => select(day)} />
          </div>
        </div>
      )}

      {isMobile ? (
        <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setParams({ dia: null })}>
          <SheetContent className="max-h-[85svh] overflow-y-auto rounded-t-2xl p-0" side="bottom">
            <SheetHeader className="sr-only">
              <SheetTitle>{selected ? longDay(selected) : "Día"}</SheetTitle>
            </SheetHeader>
            {dayPanel}
          </SheetContent>
        </Sheet>
      ) : null}
    </PageContainer>
  );
}

function Legend() {
  return (
    <ul
      aria-label="Referencias"
      className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground"
    >
      {(["libre", "cuidado", "choca", "bloqueado"] as const).map((level) => {
        const { icon: Icon, label, tone } = LEVEL[level];

        return (
          <li key={level} className="flex items-center gap-1">
            <Icon aria-hidden className={cn("size-3.5", tone)} />
            {label}
          </li>
        );
      })}
      <li className="flex items-center gap-1">
        <Bookmark aria-hidden className="size-3.5 text-info-foreground" />
        Reserva
      </li>
      <li className="flex items-center gap-1">
        <Star aria-hidden className="size-3.5 text-success" />
        Sugerida
      </li>
    </ul>
  );
}

function DayCell({
  day,
  score,
  items,
  inMonth,
  selected,
  today,
  suggested,
  tabbable,
  compact,
  loading,
  layers,
  refCallback,
  onKeyDown,
  onSelect,
}: {
  day: string;
  layers: Set<Layer>;
  score: PlanDay | undefined;
  items: PlanItem[];
  inMonth: boolean;
  selected: boolean;
  today: boolean;
  suggested: boolean;
  tabbable: boolean;
  compact: boolean;
  loading: boolean;
  refCallback: (node: HTMLButtonElement | null) => void;
  /** Arrow keys move the selection a day or a week */
  onKeyDown: (event: React.KeyboardEvent) => void;
  onSelect: () => void;
}) {
  const level = score ? LEVEL[score.level] : null;
  const shown = items.slice(0, compact ? 0 : 2);
  const more = items.length - shown.length;
  const label = [
    longDay(day),
    level?.label,
    score && !score.blocked ? `puntaje ${score.score}` : null,
    suggested ? "sugerida" : null,
    items.length > 0 ? `${items.length} ${items.length === 1 ? "evento" : "eventos"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      ref={refCallback}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "relative flex min-w-0 flex-col items-stretch gap-1 border-r border-b border-border p-1.5 text-left transition-colors outline-none [&:nth-child(7n)]:border-r-0",
        compact ? "min-h-14" : "min-h-[108px]",
        inMonth ? "hover:bg-raised" : "bg-app/40 text-faint",
        score?.level === "bloqueado" &&
          inMonth &&
          "bg-[repeating-linear-gradient(135deg,transparent_0_6px,hsl(var(--faint)/0.12)_6px_7px)]",
        score?.level === "choca" && inMonth && "shadow-[inset_2px_0_0_hsl(var(--live))]",
        selected && "z-10 ring-2 ring-primary ring-inset",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      )}
      tabIndex={tabbable ? 0 : -1}
      type="button"
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span className="flex items-center gap-1">
        <span
          className={cn(
            "font-terminal text-meta tabular-nums",
            today
              ? "grid size-5 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
              : "text-subtle",
            !inMonth && "text-faint"
          )}
        >
          {Number(day.slice(8))}
        </span>
        {suggested && inMonth ? <Star aria-hidden className="size-3 fill-success text-success" /> : null}
        <span className="ml-auto flex items-center gap-1">
          {loading && inMonth ? (
            <Skeleton className="h-3 w-6" />
          ) : level && inMonth ? (
            <>
              {!compact && !score?.blocked ? (
                <span className="font-terminal text-2xs text-muted-foreground tabular-nums">{score?.score}</span>
              ) : null}
              <level.icon aria-hidden className={cn("size-3.5", level.tone)} />
            </>
          ) : null}
        </span>
      </span>
      {!compact && inMonth && layers.has("feriados") && score?.holiday ? (
        <span className="flex min-w-0 items-center gap-1 px-1 text-2xs text-warning-foreground">
          <PartyPopper aria-hidden className="size-2.5 shrink-0" />
          <span className="truncate">{score.holiday}</span>
        </span>
      ) : null}
      {!compact && inMonth && layers.has("grandes") && score?.period && !score.holiday ? (
        <span className="truncate px-1 text-2xs text-muted-foreground">{score.period}</span>
      ) : null}
      {compact ? (
        items.length > 0 ? (
          <span aria-hidden className="flex flex-wrap gap-0.5">
            {items.slice(0, 4).map((item) => (
              <span
                key={item.id}
                className={cn(
                  "size-1.5 rounded-full",
                  item.kind === "hold"
                    ? "border border-info-foreground"
                    : item.own
                      ? "bg-foreground"
                      : "bg-muted-foreground"
                )}
              />
            ))}
          </span>
        ) : null
      ) : (
        <span className="flex min-w-0 flex-col gap-0.5">
          {shown.map((item) => (
            <ItemChip key={item.id} item={item} />
          ))}
          {more > 0 ? <span className="px-1 text-2xs text-muted-foreground">+{more} más</span> : null}
        </span>
      )}
    </button>
  );
}

/** The month as a list: each day with something on it (events, holds, a holiday), or suggested. */
function Agenda({
  days,
  itemsByDay,
  layers,
  loading,
  selected,
  suggested,
  today,
  onSelect,
}: {
  days: PlanDay[];
  itemsByDay: Map<string, PlanItem[]>;
  layers: Set<Layer>;
  loading: boolean;
  selected: string | null;
  suggested: Set<string>;
  today: string;
  onSelect: (day: string) => void;
}) {
  const shown = days.filter(
    (day) =>
      day.day >= today &&
      ((itemsByDay.get(day.day)?.length ?? 0) > 0 ||
        suggested.has(day.day) ||
        (layers.has("feriados") && day.holiday) ||
        (layers.has("grandes") && day.period))
  );

  return (
    <Panel>
      {loading ? (
        <div className="flex flex-col gap-2 p-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="p-4 text-ui text-muted-foreground">Nada este mes todavía: elegí un día en la vista de mes.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((day) => {
            const level = LEVEL[day.level];
            const items = itemsByDay.get(day.day) ?? [];

            return (
              <li key={day.day}>
                <button
                  aria-pressed={selected === day.day}
                  className={cn(
                    "flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-raised",
                    selected === day.day && "bg-raised shadow-[inset_2px_0_0_hsl(var(--primary))]"
                  )}
                  type="button"
                  onClick={() => onSelect(day.day)}
                >
                  <span className="w-20 shrink-0 font-terminal text-meta text-subtle tabular-nums first-letter:uppercase">
                    {shortDay(day.day)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {layers.has("feriados") && day.holiday ? (
                      <span className="flex items-center gap-1 text-meta text-warning-foreground">
                        <PartyPopper aria-hidden className="size-3" />
                        {day.holiday}
                      </span>
                    ) : null}
                    {layers.has("grandes") && day.period ? (
                      <span className="text-meta text-muted-foreground">{day.period}</span>
                    ) : null}
                    {items.map((item) => (
                      <ItemChip key={item.id} item={item} />
                    ))}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-meta">
                    {suggested.has(day.day) ? (
                      <Star aria-label="Sugerida" className="size-3.5 fill-success text-success" />
                    ) : null}
                    <level.icon aria-hidden className={cn("size-3.5", level.tone)} />
                    <span className="max-sm:sr-only">{level.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ItemChip({ item }: { item: PlanItem }) {
  const hold = item.kind === "hold";

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-[4px] px-1 py-px text-2xs leading-4",
        hold
          ? "border border-dashed border-info/70 text-info-foreground"
          : item.own
            ? "bg-subtle/15 font-medium text-foreground"
            : "bg-raised text-muted-foreground"
      )}
    >
      {hold ? <Bookmark aria-hidden className="size-2.5 shrink-0" /> : null}
      <span className="shrink-0 font-terminal tabular-nums">{clock(item.start)}</span>
      <span className="truncate">{item.own ? (item.title ?? "Tu reserva") : item.communityName}</span>
    </span>
  );
}

function DayDetail({
  inSheet,
  draftName,
  day,
  score,
  items,
  ownHold,
  ownEvent,
  heldUntil,
  startTime,
  durationMin,
  busy,
  onHold,
  onRenew,
  onRelease,
}: {
  /** In the phone sheet, the header leaves room for its close button */
  inSheet: boolean;
  /** The draft this date is for, when choosing one for an existing draft */
  draftName: string | null;
  day: string;
  score: PlanDay | undefined;
  items: PlanItem[];
  ownHold: PlanItem | undefined;
  ownEvent: PlanItem | undefined;
  heldUntil: string | null;
  startTime: string;
  durationMin: number;
  busy: boolean;
  onHold: (title: string) => void;
  onRenew: (eventId: string) => void;
  onRelease: (eventId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const level = score ? LEVEL[score.level] : null;
  const end = clock(new Date(Date.parse(`${day}T${startTime}:00-03:00`) + durationMin * 60_000).toISOString());

  return (
    <div className="flex flex-col">
      <PanelHead
        actions={
          level ? (
            <Badge variant={level.badge}>
              <level.icon aria-hidden />
              {level.label}
              {score && !score.blocked ? <span className="font-terminal tabular-nums">· {score.score}</span> : null}
            </Badge>
          ) : null
        }
        className={inSheet ? "pr-12" : undefined}
        icon={CalendarDays}
        title={<span className="first-letter:uppercase">{longDay(day)}</span>}
      />

      <div className="flex flex-col gap-4 p-3.5">
        {score ? (
          <section aria-label="Por qué">
            <MicroLabel className="mb-2">Por qué</MicroLabel>
            <ul className="flex flex-col gap-1.5">
              {score.reasons.map((reason, index) => {
                const { icon: Icon, tone } = REASON[reason.tone];

                return (
                  <li key={`${reason.text}-${index}`} className="flex items-start gap-2 text-ui text-foreground">
                    <Icon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0", tone)} />
                    <span>{reason.text}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <Skeleton className="h-16" />
        )}

        {items.length > 0 ? (
          <section aria-label="Ese día">
            <MicroLabel className="mb-2">Ese día</MicroLabel>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-2.5 px-2.5 py-2">
                  <span className="w-11 shrink-0 font-terminal text-meta text-muted-foreground tabular-nums">
                    {clock(item.start)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui text-foreground">
                      {item.kind === "hold" && !item.own ? "Reserva tentativa" : item.title}
                    </span>
                    <span className="block truncate text-meta text-muted-foreground">
                      {item.own ? "Tu comunidad" : item.communityName}
                      {item.isOwu ? " · organiza OWU" : ""}
                    </span>
                  </span>
                  {item.kind === "hold" ? (
                    <Badge className="border-dashed" variant="info">
                      <Bookmark aria-hidden />
                      Reserva
                    </Badge>
                  ) : null}
                  {item.url ? (
                    <Button asChild size="icon-sm" variant="ghost">
                      <a aria-label={`Ver «${item.title}» en Meetup`} href={item.url} rel="noreferrer" target="_blank">
                        <ExternalLink />
                      </a>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {ownHold ? (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-info/60 bg-info-surface p-3">
            <p className="flex items-center gap-1.5 text-ui font-medium text-foreground">
              <Bookmark aria-hidden className="size-3.5 text-info-foreground" />
              Reservaste este día
            </p>
            {heldUntil ? (
              <p className="text-meta text-muted-foreground">
                Hasta el <span className="font-terminal tabular-nums">{shortDay(dayKey(heldUntil))}</span>. Después se
                libera sola.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button disabled={busy} size="sm" variant="outline" onClick={() => onRenew(ownHold.id)}>
                Renovar 14 días
              </Button>
              <Button disabled={busy} size="sm" variant="ghost" onClick={() => onRelease(ownHold.id)}>
                Liberar
              </Button>
            </div>
          </div>
        ) : score?.blocked ? null : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onHold(title.trim());
            }}
          >
            {ownEvent ? (
              <p className="flex items-start gap-1.5 text-meta text-warning-foreground">
                <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                Tu comunidad ya tiene un evento ese día.
              </p>
            ) : null}
            {draftName ? (
              <p className="text-meta text-muted-foreground">
                Fecha para <span className="font-medium text-foreground">«{draftName}»</span>
              </p>
            ) : (
              <>
                <label className="sr-only" htmlFor="hold-title">
                  Qué es (opcional)
                </label>
                <Input
                  id="hold-title"
                  maxLength={120}
                  placeholder="Qué es: Meetup de junio (opcional)"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </>
            )}
            <Button disabled={busy || !score} type="submit">
              <Bookmark />
              Reservar ·{" "}
              <span className="font-terminal tabular-nums">
                {startTime}–{end}
              </span>
            </Button>
            <p className="text-meta text-muted-foreground">
              Todas las comunidades la ven por 14 días. La renovás o la liberás cuando quieras.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Suggestions({
  days,
  selected,
  onPick,
}: {
  days: PlanDay[] | undefined;
  selected: string | null;
  onPick: (day: string) => void;
}) {
  return (
    <Panel>
      <PanelHead icon={Sparkles} title="Fechas sugeridas" />
      {days === undefined ? (
        <div className="flex flex-col gap-2 p-3.5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <p className="p-3.5 text-ui text-muted-foreground">Este mes no queda ningún día disponible.</p>
      ) : (
        <ul className="flex flex-col p-1.5">
          {days.map((day) => {
            const level = LEVEL[day.level];
            const why = day.reasons.find((reason) => reason.tone !== "ok") ?? day.reasons[0];

            return (
              <li key={day.day}>
                <button
                  aria-current={day.day === selected ? "date" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-raised",
                    day.day === selected && "bg-raised"
                  )}
                  type="button"
                  onClick={() => onPick(day.day)}
                >
                  <level.icon aria-hidden className={cn("size-3.5 shrink-0", level.tone)} />
                  <span className="w-[88px] shrink-0 font-terminal text-ui whitespace-nowrap text-foreground tabular-nums">
                    {shortDay(day.day)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">{why?.text}</span>
                  <span className="font-terminal text-meta text-subtle tabular-nums">{day.score}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
