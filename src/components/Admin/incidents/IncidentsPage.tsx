"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ImageIcon, ListFilter, LockKeyhole, Siren, UserRoundCheck, UserRoundX, X } from "lucide-react";

import { useSession } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import { EditorPanel } from "components/Admin/panel";
import { useCommands } from "components/Admin/shell/commands";
import { usePresenceFocus } from "components/Admin/shell/presence";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { useShell } from "components/Admin/shell/use-shell-status";
import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { SwipeRow, useSwipeTabs, type SwipeAction } from "components/Admin/ui/swipe";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { useIsMobile } from "components/shared/ui/sidebar";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import type { Incident, IncidentCategory, IncidentSeverity, IncidentStatus } from "lib/orpc/incidents/schemas";
import { eventChannel } from "lib/realtime/channels";

import { IncidentBody, IncidentSummary, NoteComposer } from "./IncidentDetail";
import {
  CATEGORIES,
  CATEGORY,
  firstName,
  incidentPlace,
  isLoud,
  SEVERITIES,
  SEVERITY,
  SeverityDot,
  SeverityLabel,
  StatusBadge,
} from "./meta";
import { ReportIncidentPanel } from "./ReportIncident";

type View = "open" | "in_progress" | "resolved" | "all";
const VIEWS: { value: View; label: string; matches: (incident: Incident) => boolean }[] = [
  { value: "open", label: "Abiertos", matches: (incident) => incident.status !== "resolved" },
  { value: "in_progress", label: "En curso", matches: (incident) => incident.status === "in_progress" },
  { value: "resolved", label: "Resueltos", matches: (incident) => incident.status === "resolved" },
  { value: "all", label: "Todos", matches: () => true },
];
const VIEW_VALUES = VIEWS.map((item) => item.value);
const ANY = "all";

/** The detail sits next to the list from this width; below it, it opens as a sheet. */
const WIDE = "(min-width: 1280px)";
const subscribeWide = (listener: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
/** Null until hydrated: the server can't know, and a sheet opened by a guess won't close cleanly. */
function useWide(): boolean | null {
  return React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => null
  );
}

/** Rewrite one search param in place: no navigation, no server round trip. */
function setSearchParam(key: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
}

const ROW_GRID = "grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[5.5rem_minmax(0,1fr)_8.5rem_5.5rem_5.5rem]";

type RowActions = ReturnType<typeof useRowActions>;

/**
 * A finger's shortcuts on the list: take an incident, resolve it (with a Deshacer that reopens it). The same as the
 * detail's «Tomarlo» and «Resuelto», shown at once.
 */
function useRowActions(eventId: string, meId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const listKey = orpc.incidents.list.queryKey({ input: { eventId } });
  const optimistic = <I extends { id: string }>(
    patch: (incident: Incident, input: I) => Incident,
    failure: string
  ) => ({
    onMutate: async (input: I) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<Incident[]>(listKey);
      queryClient.setQueryData<Incident[]>(listKey, (list) =>
        list?.map((item) => (item.id === input.id ? patch(item, input) : item))
      );
      return { previous };
    },
    onError: (error: Error, _input: I, context: { previous?: Incident[] } | undefined) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      toast.error(failure, error.message);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: orpc.incidents.get.key() });
    },
  });
  // Mine at once (the row can be swiped again right away); the name fills in with the session.
  const me = { id: meId, name: session?.user.name ?? "", image: session?.user.image ?? null };
  const take = useMutation(
    orpc.incidents.assignToMe.mutationOptions(
      optimistic(
        (incident) => ({
          ...incident,
          assignee: me,
          status: incident.status === "open" ? "in_progress" : incident.status,
        }),
        "No se pudo tomar"
      )
    )
  );
  const update = useMutation(
    orpc.incidents.update.mutationOptions(
      optimistic<{ id: string; status?: IncidentStatus }>(
        (incident, input) => (input.status ? { ...incident, status: input.status } : incident),
        "No se pudo cambiar"
      )
    )
  );

  return {
    take: (incident: Incident) =>
      take.mutate(
        { eventId, id: incident.id },
        { onSuccess: () => toast.success("Es tuyo", `«${incident.title}» quedó en curso a tu nombre.`) }
      ),
    resolve: (incident: Incident) => {
      const before = incident.status;
      update.mutate({ eventId, id: incident.id, status: "resolved" });
      toast.success({
        title: "Lo resolviste",
        description: `«${incident.title}»`,
        duration: 6000,
        action: { label: "Deshacer", onClick: () => update.mutate({ eventId, id: incident.id, status: before }) },
      });
    },
  };
}

/** Slides right to take it, left to resolve it (its assignee or an editor); a resolved one stays still. */
function SwipeIncident({
  incident,
  meId,
  canEdit,
  actions,
  children,
}: {
  incident: Incident;
  meId: string;
  canEdit: boolean;
  actions: RowActions;
  children: React.ReactNode;
}) {
  const mine = incident.assignee?.id === meId;
  const open = incident.status !== "resolved";
  const right: SwipeAction | null =
    open && !mine ? { label: "Tomarlo", icon: UserRoundCheck, tone: "info", run: () => actions.take(incident) } : null;
  const left: SwipeAction | null =
    open && (canEdit || mine)
      ? { label: "Resolver", icon: CircleCheck, tone: "ok", run: () => actions.resolve(incident) }
      : null;
  // A row with nothing to do stays a plain row, so a sideways swipe on it still changes the tab.
  if (!right && !left) return children;

  return (
    <SwipeRow className="rounded-none" left={left} right={right}>
      {children}
    </SwipeRow>
  );
}

function IncidentRow({
  incident,
  selected,
  onSelect,
  meId,
  canEdit,
  actions,
}: {
  incident: Incident;
  selected: boolean;
  onSelect: () => void;
  meId: string;
  canEdit: boolean;
  actions: RowActions;
}) {
  const category = CATEGORY[incident.category];
  const place = incidentPlace(incident);

  return (
    <li>
      <SwipeIncident actions={actions} canEdit={canEdit} incident={incident} meId={meId}>
        <button
          aria-current={selected || undefined}
          className={cn(
            // Solid colours: a row a finger slides moves over what the swipe does.
            "grid w-full items-center gap-x-3 bg-card px-4 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,white_2%,hsl(var(--card)))] focus-visible:bg-[color-mix(in_srgb,white_3%,hsl(var(--card)))] focus-visible:outline-hidden md:min-h-[52px]",
            ROW_GRID,
            selected &&
              "bg-[color-mix(in_srgb,hsl(var(--primary))_4%,hsl(var(--card)))] shadow-[inset_2px_0_0_hsl(var(--primary))] hover:bg-[color-mix(in_srgb,hsl(var(--primary))_5%,hsl(var(--card)))]"
          )}
          type="button"
          onClick={onSelect}
        >
          <span className="flex items-center gap-2 self-start pt-1.5 md:self-center md:pt-0">
            <SeverityDot incident={incident} />
            <SeverityLabel className="max-md:hidden" severity={incident.severity} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "line-clamp-2 text-ui font-medium md:truncate",
                  incident.status === "resolved" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {incident.title}
              </span>
              {incident.sensitive ? (
                <LockKeyhole aria-label="Confidencial" className="size-3.5 shrink-0 text-live-foreground" />
              ) : null}
              {incident.hasPhoto ? (
                <ImageIcon aria-label="Con foto" className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-meta text-muted-foreground">
              <category.icon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">
                {category.label}
                {place ? ` · ${place}` : ""}
                <span className="md:hidden">
                  {" · "}
                  {SEVERITY[incident.severity].label}
                  {incident.assignee ? ` · ${firstName(incident.assignee.name)}` : ""}
                </span>
              </span>
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-2 text-meta max-md:hidden">
            {incident.assignee ? (
              <>
                <PersonAvatar image={incident.assignee.image} name={incident.assignee.name} size={20} />
                <span className="truncate text-subtle">{firstName(incident.assignee.name)}</span>
              </>
            ) : (
              <>
                <UserRoundX aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground">Sin asignar</span>
              </>
            )}
          </span>
          <RelativeTime className="max-md:hidden" date={incident.createdAt} />
          <span className="flex flex-col items-end gap-1 self-start md:items-start md:self-center">
            <StatusBadge status={incident.status} />
            <RelativeTime className="text-2xs md:hidden" date={incident.createdAt} />
          </span>
        </button>
      </SwipeIncident>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul aria-hidden className="divide-y divide-border">
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index} className={cn("grid items-center gap-x-3 px-4 py-3.5", ROW_GRID)}>
          <Skeleton className="size-2 rounded-full md:h-3 md:w-14" />
          <span className="space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </span>
          <Skeleton className="h-3 w-20 max-md:hidden" />
          <Skeleton className="h-3 w-12 max-md:hidden" />
          <Skeleton className="h-5 w-16" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Incidentes: everything that needs someone today, the loudest on top. Anyone on the staff
 * reports and takes incidents; editors assign and close them. The detail sits on the right on
 * wide screens and opens as a sheet on phones.
 */
export function IncidentsPage({ eventId, meId, canEdit }: { eventId: string; meId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const wide = useWide();
  const phone = useIsMobile();
  const { status } = useShell();
  const timezone = status?.event.timezone;

  const selectedId = searchParams.get("incidente");
  const askedToReport = searchParams.get("nuevo") === "1";
  const [reporting, setReporting] = React.useState(askedToReport);
  const [view, setView] = React.useState<View>("open");
  const [severity, setSeverity] = React.useState<IncidentSeverity | typeof ANY>(ANY);
  const [category, setCategory] = React.useState<IncidentCategory | typeof ANY>(ANY);

  // ⌘K and Mi turno link here with ?nuevo=1, also while the page is already open.
  React.useEffect(() => {
    if (askedToReport) setReporting(true);
  }, [askedToReport]);

  const list = useQuery(
    orpc.incidents.list.queryOptions({ input: { eventId }, staleTime: 15_000, refetchOnWindowFocus: true })
  );
  const detail = useQuery(
    orpc.incidents.get.queryOptions({ input: selectedId ? { eventId, id: selectedId } : skipToken, retry: false })
  );
  const roomsQuery = useQuery(
    orpc.rooms.getByOpenSpace.queryOptions({ input: { openSpaceId: eventId }, staleTime: 60_000 })
  );
  const rosterQuery = useQuery(
    orpc.staffTasks.roster.queryOptions({ input: { eventId }, enabled: canEdit, staleTime: 5 * 60_000 })
  );
  const rooms = (roomsQuery.data ?? []).filter((room) => room.isActive);
  const roster = (rosterQuery.data ?? []).map((member) => ({
    userId: member.userId,
    name: member.name,
    image: member.image,
  }));

  useRealtimeChannel(eventChannel(eventId, "ops"), (topic) => {
    if (topic === "incidents") {
      void queryClient.invalidateQueries({ queryKey: orpc.incidents.list.key({ input: { eventId } }) });
      void queryClient.invalidateQueries({ queryKey: orpc.incidents.get.key() });
    } else if (topic === "rooms") {
      void queryClient.invalidateQueries({
        queryKey: orpc.rooms.getByOpenSpace.key({ input: { openSpaceId: eventId } }),
      });
    }
  });

  const select = (id: string | null) => setSearchParam("incidente", id);
  const rowActions = useRowActions(eventId, meId);
  const swipeTabs = useSwipeTabs(VIEW_VALUES, view, setView);
  const openReport = () => setReporting(true);
  const closeReport = (open: boolean) => {
    setReporting(open);
    if (!open && askedToReport) setSearchParam("nuevo", null);
  };
  usePresenceFocus(selectedId);

  const incidents = list.data ?? [];
  const unresolved = incidents.filter((incident) => incident.status !== "resolved");
  const critical = unresolved.filter((incident) => incident.severity === "critical").length;
  const filtered = incidents.filter(
    (incident) =>
      VIEWS.find((item) => item.value === view)!.matches(incident) &&
      (severity === ANY || incident.severity === severity) &&
      (category === ANY || incident.category === category)
  );
  const filtering = severity !== ANY || category !== ANY;

  useShortcuts([
    { id: "incidents.report", keys: "i", label: "Reportar un incidente", group: "Incidentes", run: openReport },
    ...(selectedId && wide
      ? [
          {
            id: "incidents.close",
            keys: "escape",
            label: "Cerrar el incidente",
            group: "Incidentes",
            // An open dropdown or dialog takes Esc for itself.
            run: () => !document.querySelector('[role="listbox"], [role="dialog"], [role="menu"]') && select(null),
          },
        ]
      : []),
  ]);
  useCommands(
    "incidents.open",
    "page",
    unresolved.slice(0, 8).map((incident) => ({
      id: `incident:${incident.id}`,
      title: incident.title,
      subtitle: [SEVERITY[incident.severity].label, incidentPlace(incident)].filter(Boolean).join(" · "),
      icon: CATEGORY[incident.category].icon,
      tone: isLoud(incident.severity) ? "text-live-foreground" : undefined,
      keywords: ["incidente", CATEGORY[incident.category].label],
      perform: { type: "run" as const, run: () => select(incident.id) },
    })),
    "Incidentes abiertos"
  );

  const detailBody = detail.data ? (
    <IncidentBody
      canEdit={canEdit}
      eventId={eventId}
      incident={detail.data}
      meId={meId}
      rooms={rooms}
      roster={roster}
      timezone={timezone}
    />
  ) : null;
  const detailMissing = detail.isError ? (
    <ErrorState
      compact
      description="Puede que lo hayan movido a otro evento o que sea confidencial."
      title="No encontramos ese incidente"
    />
  ) : null;
  const detailLoading = (
    <div aria-hidden className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-24 w-full" />
    </div>
  );

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          <Button onClick={openReport}>
            <Siren />
            Reportar
            <Kbd className="max-md:hidden">I</Kbd>
          </Button>
        }
        description="Lo que necesita a alguien en el evento. Reportalo, tomalo y cerralo; alta y crítica avisan a todo el staff."
        meta={
          list.data ? (
            <>
              <Badge
                className="font-terminal tabular-nums"
                variant={unresolved.some((incident) => isLoud(incident.severity)) ? "destructive" : "secondary"}
              >
                {unresolved.length} {unresolved.length === 1 ? "abierto" : "abiertos"}
              </Badge>
              {critical > 0 ? (
                <Badge className="font-terminal tabular-nums" variant="destructive">
                  <StatusDot pulse tone="live" />
                  {critical} {critical === 1 ? "crítico" : "críticos"}
                </Badge>
              ) : null}
            </>
          ) : null
        }
        title="Incidentes"
      />

      <div ref={swipeTabs}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <ToggleGroup.Root
            aria-label="Ver incidentes"
            className="-mb-px flex items-center gap-4 border-b border-border max-sm:w-full max-sm:justify-between max-sm:gap-2"
            type="single"
            value={view}
            onValueChange={(value) => value && setView(value as View)}
          >
            {VIEWS.map((item) => (
              <ToggleGroup.Item
                key={item.value}
                className={cn(
                  "relative inline-flex h-9 items-center gap-1.5 text-ui font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden pointer-coarse:h-11",
                  "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full",
                  view === item.value
                    ? "text-foreground after:bg-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                value={item.value}
              >
                {item.label}
                <span className="font-terminal text-2xs text-muted-foreground tabular-nums">
                  {list.data ? incidents.filter(item.matches).length : ""}
                </span>
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
          <div className="flex items-center gap-2 max-sm:w-full">
            <Select value={severity} onValueChange={(value) => setSeverity(value as IncidentSeverity | typeof ANY)}>
              <SelectTrigger aria-label="Gravedad" className="w-[9.5rem] max-sm:flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Toda gravedad</SelectItem>
                {SEVERITIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={(value) => setCategory(value as IncidentCategory | typeof ANY)}>
              <SelectTrigger aria-label="Tipo" className="w-[9.5rem] max-sm:flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Todo tipo</SelectItem>
                {CATEGORIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <span className="flex items-center gap-2">
                      <item.icon aria-hidden className="size-3.5 text-muted-foreground" />
                      {item.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <Panel>
            <div
              aria-hidden
              className={cn(
                "grid h-[34px] items-center gap-x-3 border-b border-border px-4 text-meta font-medium text-muted-foreground max-md:hidden",
                ROW_GRID
              )}
            >
              <span>Gravedad</span>
              <span>Incidente</span>
              <span>Asignado</span>
              <span>Hace</span>
              <span>Estado</span>
            </div>
            {list.isPending ? (
              <ListSkeleton />
            ) : list.isError ? (
              <div className="p-4">
                <ErrorState retrying={list.isFetching} onRetry={() => void list.refetch()} />
              </div>
            ) : filtered.length === 0 ? (
              view === "open" && !filtering ? (
                <EmptyState
                  action={
                    <Button variant="outline" onClick={openReport}>
                      <Siren />
                      Reportar incidente
                    </Button>
                  }
                  className="m-4"
                  description="No hay incidentes abiertos. Owy sigue tomando mate y mirando."
                  owy
                  title="Todo tranquilo por acá"
                />
              ) : (
                <EmptyState
                  action={
                    filtering ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSeverity(ANY);
                          setCategory(ANY);
                        }}
                      >
                        Limpiar filtros
                      </Button>
                    ) : undefined
                  }
                  compact
                  description={filtering ? "Probá con otra gravedad o tipo." : "Cuando haya, aparecen acá."}
                  icon={ListFilter}
                  title="Nada por acá"
                />
              )
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((incident) => (
                  <IncidentRow
                    key={incident.id}
                    actions={rowActions}
                    canEdit={canEdit}
                    incident={incident}
                    meId={meId}
                    selected={incident.id === selectedId}
                    onSelect={() => select(incident.id === selectedId && wide ? null : incident.id)}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <aside className="sticky top-5 hidden xl:block">
            <Panel className="flex max-h-[calc(var(--admin-content-h)-2.5rem)] flex-col">
              <PanelHead
                actions={
                  selectedId ? (
                    <Button
                      aria-label="Cerrar el incidente"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => select(null)}
                    >
                      <X />
                    </Button>
                  ) : undefined
                }
                icon={Siren}
                title="Incidente"
              />
              {selectedId ? (
                <>
                  <div className="min-h-0 flex-1 scrollbar-thin space-y-5 overflow-y-auto p-4">
                    {detail.data ? (
                      <>
                        <IncidentSummary incident={detail.data} />
                        {detailBody}
                      </>
                    ) : (
                      (detailMissing ?? detailLoading)
                    )}
                  </div>
                  {detail.data ? (
                    <div className="border-t border-border p-3">
                      <NoteComposer eventId={eventId} incidentId={detail.data.id} />
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  compact
                  className="py-12"
                  description="Ves el detalle y el registro, y podés tomarlo, anotar o cerrarlo."
                  icon={Siren}
                  title="Elegí un incidente"
                />
              )}
            </Panel>
          </aside>
        </div>
      </div>

      <EditorPanel
        icon={Siren}
        open={Boolean(selectedId) && wide === false}
        title={detail.data?.title ?? "Incidente"}
        onOpenChange={(open) => !open && select(null)}
      >
        {detail.data ? (
          <div className="space-y-6">
            <IncidentSummary incident={detail.data} showTitle={false} />
            {detailBody}
            <NoteComposer eventId={eventId} incidentId={detail.data.id} />
          </div>
        ) : (
          (detailMissing ?? detailLoading)
        )}
      </EditorPanel>

      <ReportIncidentPanel
        eventId={eventId}
        open={reporting}
        rooms={rooms}
        source={phone ? "phone" : "admin"}
        onOpenChange={closeReport}
        onReported={(incident) => select(incident.id)}
      />
    </PageContainer>
  );
}
