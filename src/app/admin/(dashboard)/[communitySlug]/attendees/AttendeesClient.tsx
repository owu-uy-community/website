"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, ScanLine, ScanQrCode, Search, Settings, Ticket, X } from "lucide-react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { parseAsArrayOf, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { cn } from "app/lib/utils";
import { ArrivalsFeed } from "components/Admin/attendees/ArrivalsFeed";
import { AttendeesTable, NoAttendees } from "components/Admin/attendees/AttendeesTable";
import { DoorsPanel } from "components/Admin/attendees/DoorsPanel";
import { FacetFilter } from "components/Admin/attendees/FacetFilter";
import { downloadCsv } from "components/Admin/attendees/helpers";
import { KpiStrip } from "components/Admin/attendees/KpiStrip";
import { RafflesPanel } from "components/Admin/attendees/RafflesPanel";
import { useAttendeeSync } from "components/Admin/attendees/use-attendee-sync";
import { useActiveTabInView } from "components/Admin/comms/PageTabs";
import { Notice } from "components/Admin/panel";
import { useCommands } from "components/Admin/shell/commands";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { useSwipeTabs } from "components/Admin/ui/swipe";
import { formatRelative, useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Kbd } from "components/shared/ui/kbd";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import type { AttendeeSort, Presence, SyncState } from "lib/orpc/attendees/schemas";
import { eventChannel } from "lib/realtime/channels";

const PAGE_SIZE = 50;

// The URL speaks Spanish; the API keeps its own words.
const TAB_PARAMS = ["todos", "acreditados", "por-llegar", "en-espera", "pendientes", "cancelados"] as const;
type TabParam = (typeof TAB_PARAMS)[number];
/** `onlyWhenAny`: the waitlist and approval tabs show up only for events that have them (OWU's own RSVP). */
const TABS: { param: TabParam; presence: Presence; label: string; onlyWhenAny?: boolean }[] = [
  { param: "todos", presence: "all", label: "Todos" },
  { param: "acreditados", presence: "in", label: "Acreditados" },
  { param: "por-llegar", presence: "out", label: "Por llegar" },
  { param: "en-espera", presence: "waiting", label: "En espera", onlyWhenAny: true },
  { param: "pendientes", presence: "pending", label: "Pendientes", onlyWhenAny: true },
  { param: "cancelados", presence: "cancelled", label: "Cancelados" },
];
const PRESENCE_OF = Object.fromEntries(TABS.map((tab) => [tab.param, tab.presence])) as Record<TabParam, Presence>;

const SORT_PARAMS = ["nombre", "-nombre", "llegada", "-llegada", "registro", "-registro"] as const;
type SortParam = (typeof SORT_PARAMS)[number];
const SORT_OF: Record<SortParam, AttendeeSort> = {
  nombre: "name",
  "-nombre": "-name",
  llegada: "checkin",
  "-llegada": "-checkin",
  registro: "registered",
  "-registro": "-registered",
};
const PARAM_OF = Object.fromEntries(Object.entries(SORT_OF).map(([param, sort]) => [sort, param])) as Record<
  AttendeeSort,
  SortParam
>;

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Where the mirror stands: Eventbrite and how long ago it was read, or what's wrong. */
function SyncBadge({
  state,
  missing,
  failed,
}: {
  state: SyncState | undefined;
  missing: SyncState["missing"];
  failed: boolean;
}) {
  const now = useNow(5000);
  if (failed || state?.error) {
    return (
      <Badge variant="destructive">
        <StatusDot tone="live" />
        Error con Eventbrite
      </Badge>
    );
  }
  if (missing === "event_id") return <Badge variant="secondary">Sin Eventbrite</Badge>;
  if (missing === "api_key") {
    return (
      <Badge variant="warning">
        <StatusDot tone="warn" />
        Eventbrite sin clave
      </Badge>
    );
  }
  if (!state) return null;
  const seconds = state.syncedAt && now ? Math.max(0, Math.round((now - Date.parse(state.syncedAt)) / 1000)) : null;

  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant="success">
        <StatusDot tone="ok" />
        Eventbrite
      </Badge>
      {state.syncedAt && seconds !== null ? (
        <span className="font-terminal text-2xs text-muted-foreground tabular-nums">
          sincronizado {seconds < 60 ? `hace ${seconds} s` : formatRelative(Date.parse(state.syncedAt) - now)}
        </span>
      ) : null}
    </span>
  );
}

type Props = {
  eventId: string;
  eventName: string;
  timezone: string;
  startsAt: string;
  settingsHref: string;
  scannerHref: string;
  webhookUrl: string | null;
  /** What the server knew when it rendered: a setup problem, and whether the mirror has anyone. */
  initialSetup: { missing: SyncState["missing"]; mirrored: boolean };
};

function Attendees({
  eventId,
  eventName,
  timezone,
  startsAt,
  settingsHref,
  scannerHref,
  webhookUrl,
  initialSetup,
}: Props) {
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [params, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      estado: parseAsStringLiteral(TAB_PARAMS).withDefault("todos"),
      entrada: parseAsArrayOf(parseAsString).withDefault([]),
      etiqueta: parseAsArrayOf(parseAsString).withDefault([]),
      orden: parseAsStringLiteral(SORT_PARAMS).withDefault("nombre"),
      pagina: parseAsInteger.withDefault(1),
      // ⌘K's "Buscar asistente…" lands here with ?buscar=1.
      buscar: parseAsString,
    },
    { history: "replace" }
  );
  const q = useDebounced(params.q.trim(), 250);
  const filters = {
    eventId,
    q,
    status: PRESENCE_OF[params.estado],
    ticket: params.entrada,
    tag: params.etiqueta,
  };
  const filtered = Boolean(
    params.q.trim() || params.entrada.length || params.etiqueta.length || params.estado !== "todos"
  );

  const list = useQuery(
    orpc.attendees.list.queryOptions({
      input: { ...filters, sort: SORT_OF[params.orden], page: params.pagina, pageSize: PAGE_SIZE },
      placeholderData: keepPreviousData,
    })
  );
  const stats = useQuery(orpc.attendees.checkins.queryOptions({ input: { eventId }, refetchInterval: 60_000 }));
  const recent = useQuery(orpc.attendees.recent.queryOptions({ input: { eventId } }));
  const raffles = useQuery(orpc.attendees.raffles.list.queryOptions({ input: { eventId } }));
  const { state: sync, syncNow, syncing } = useAttendeeSync(eventId);

  useRealtimeChannel(eventChannel(eventId, "ops"), (topic) => {
    if (topic === "checkins") {
      for (const key of [orpc.attendees.list.key(), orpc.attendees.checkins.key(), orpc.attendees.recent.key()]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    }
    if (topic === "raffle") void queryClient.invalidateQueries({ queryKey: orpc.attendees.raffles.key() });
  });

  const exportAll = useMutation(
    orpc.attendees.export.mutationOptions({
      onSuccess: downloadCsv,
      onError: (failure) => toast.error("No se pudo exportar", failure.message),
    })
  );
  // ⌘K keeps the entries it was given; this way its export always uses the filters on screen.
  const exportNow = useRef(() => {});
  useEffect(() => {
    exportNow.current = () => exportAll.mutate(filters);
  });

  useEffect(() => {
    if (!params.buscar) return;
    searchRef.current?.focus();
    void setParams({ buscar: null });
  }, [params.buscar, setParams]);

  const totals = list.data?.totals;
  const facets = list.data?.facets;
  const total = facets ? facets.status[PRESENCE_OF[params.estado]] : 0;

  // A page past the end (the list shrank under it) goes back to the first.
  useEffect(() => {
    if (list.data && !list.isPlaceholderData && list.data.rows.length === 0 && total > 0 && params.pagina > 1) {
      void setParams({ pagina: null });
    }
  }, [list.data, list.isPlaceholderData, total, params.pagina, setParams]);

  useShortcuts([
    {
      id: "attendees.search",
      keys: "/",
      label: "Buscar asistentes",
      group: "Asistentes",
      run: () => searchRef.current?.focus(),
    },
  ]);
  useCommands(
    "attendees",
    "page",
    [
      {
        id: "attendees:doors",
        title: "Puertas de check-in",
        subtitle: "Organizer, webhook y escáner",
        icon: ScanQrCode,
        keywords: ["organizer", "puerta", "check-in", "qr", "acreditación"],
        perform: { type: "run", run: () => setDoorsOpen(true) },
      },
      {
        id: "attendees:scanner",
        title: "Abrir el escáner (beta)",
        subtitle: "Acredita solo en OWU",
        icon: ScanLine,
        keywords: ["escanear", "cámara", "qr", "check-in"],
        perform: { type: "navigate", href: scannerHref },
      },
      {
        id: "attendees:sync",
        title: "Sincronizar con Eventbrite",
        icon: RefreshCw,
        keywords: ["eventbrite", "actualizar"],
        perform: { type: "run", run: syncNow },
      },
      {
        id: "attendees:export",
        title: "Exportar asistentes",
        subtitle: "CSV con los filtros de ahora",
        icon: Download,
        keywords: ["csv", "excel", "planilla", "descargar"],
        perform: { type: "run", run: () => exportNow.current() },
      },
    ],
    "Asistentes"
  );

  const state = sync.data;
  // Until the first sync answers, what the server already knew: notices don't pop in and push the page down.
  const missing = state ? state.missing : initialSetup.missing;
  const expected = totals ? totals.in + totals.out : 0;
  const unconfigured = missing === "event_id" && (totals ? totals.all === 0 : !initialSetup.mirrored);
  // The table's columns depend on it: the same function on every render.
  const sortBy = useCallback(
    (sort: AttendeeSort) =>
      void setParams({ orden: PARAM_OF[sort] === "nombre" ? null : PARAM_OF[sort], pagina: null }),
    [setParams]
  );
  const setFilter = (next: { [Key in keyof typeof params]?: (typeof params)[Key] | null }) =>
    void setParams({ ...next, pagina: null });
  const clearFilters = () => void setParams({ q: null, estado: null, entrada: null, etiqueta: null, pagina: null });
  // A tap on a tab and a sideways swipe on the list (touchscreens) change the URL the same way.
  const changeTab = (value: string) => setFilter({ estado: TAB_PARAMS.find((param) => param === value) ?? "todos" });
  const swipeTabs = useSwipeTabs(TAB_PARAMS, params.estado, changeTab);
  useActiveTabInView(tabsRef, params.estado);

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          unconfigured ? null : (
            <>
              <Button disabled={syncing || Boolean(missing)} variant="outline" onClick={syncNow}>
                <RefreshCw className={cn(syncing && "motion-safe:animate-spin")} />
                <span className="max-sm:sr-only">Sincronizar ahora</span>
              </Button>
              <Button
                disabled={exportAll.isPending || !totals?.all}
                variant="outline"
                onClick={() => exportAll.mutate(filters)}
              >
                <Download />
                <span className="max-sm:sr-only">Exportar</span>
              </Button>
              <Button onClick={() => setDoorsOpen(true)}>
                <ScanQrCode />
                Puertas de check-in
              </Button>
            </>
          )
        }
        description="Entradas de Eventbrite y acreditaciones de Eventbrite Organizer, en vivo."
        meta={
          <>
            <SyncBadge failed={sync.isError} missing={missing} state={state} />
            {totals && expected > 0 ? (
              <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                {totals.in} / {expected} acreditados · {Math.round((totals.in / expected) * 100)}%
              </span>
            ) : null}
          </>
        }
        title="Asistentes"
      />

      {unconfigured ? (
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href={settingsHref}>
                <Settings />
                Abrir los ajustes del evento
              </Link>
            </Button>
          }
          description="Cargá el ID del evento de Eventbrite en los ajustes y las entradas aparecen acá solas, con cada acreditación de la puerta."
          icon={Ticket}
          title="Este evento no está conectado a Eventbrite"
        />
      ) : (
        <>
          <div className="mb-4 space-y-3 empty:hidden">
            {sync.isError ? (
              <ErrorState
                compact
                description={sync.error.message}
                retrying={syncing}
                title="No pudimos sincronizar con Eventbrite"
                onRetry={syncNow}
              />
            ) : state?.error ? (
              <ErrorState
                compact
                description={`${state.error}. Lo que ves es la última copia que tenemos.`}
                retrying={syncing}
                title="No pudimos leer Eventbrite"
                onRetry={syncNow}
              />
            ) : null}
            {missing === "api_key" ? (
              <Notice tone="warning">
                Falta la clave de Eventbrite en el servidor (
                <span className="font-terminal text-meta">EVENTBRITE_API_KEY</span>
                ): la lista es la última copia y no se actualiza sola.
              </Notice>
            ) : missing === "event_id" ? (
              <Notice tone="info">
                Este evento ya no tiene un evento de Eventbrite: lo que ves es la última copia.{" "}
                <Link className="text-info-foreground underline-offset-4 hover:underline" href={settingsHref}>
                  Cargalo en los ajustes
                </Link>
                .
              </Notice>
            ) : null}
          </div>

          <KpiStrip opensAt={startsAt} stats={stats.data} timezone={timezone} totals={totals} />

          <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <TabsPrimitive.Root className="min-w-0" value={params.estado} onValueChange={changeTab}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <TabsPrimitive.List
                  ref={tabsRef}
                  aria-label="Asistentes por estado"
                  className="flex max-w-full [scrollbar-width:none] gap-5 overflow-x-auto"
                >
                  {TABS.filter(
                    (tab) => !tab.onlyWhenAny || params.estado === tab.param || (totals?.[tab.presence] ?? 0) > 0
                  ).map((tab) => (
                    <TabsPrimitive.Trigger
                      key={tab.param}
                      className="relative flex h-9 shrink-0 items-center gap-1.5 text-ui font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full hover:text-foreground focus-visible:text-foreground focus-visible:after:bg-ring/70 data-[state=active]:text-foreground data-[state=active]:after:bg-primary pointer-coarse:h-11"
                      value={tab.param}
                    >
                      {tab.label}
                      <span className="font-terminal text-[10.5px] text-muted-foreground tabular-nums">
                        {facets ? facets.status[tab.presence] : "–"}
                      </span>
                    </TabsPrimitive.Trigger>
                  ))}
                </TabsPrimitive.List>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      ref={searchRef}
                      aria-label="Buscar asistentes"
                      autoComplete="off"
                      className="pr-9 pl-8"
                      enterKeyHint="search"
                      placeholder="Nombre, email o código…"
                      value={params.q}
                      onChange={(event) => setFilter({ q: event.target.value || null })}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && params.q) {
                          event.preventDefault();
                          setFilter({ q: null });
                        }
                      }}
                    />
                    {params.q ? (
                      <Button
                        aria-label="Borrar la búsqueda"
                        className="absolute top-1/2 right-1 -translate-y-1/2"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => {
                          setFilter({ q: null });
                          searchRef.current?.focus();
                        }}
                      >
                        <X />
                      </Button>
                    ) : (
                      <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 max-sm:hidden">/</Kbd>
                    )}
                  </div>
                  <FacetFilter
                    emptyLabel="Sin entrada"
                    options={facets?.tickets ?? []}
                    selected={params.entrada}
                    title="Entrada"
                    onChange={(values) => setFilter({ entrada: values.length ? values : null })}
                  />
                  <FacetFilter
                    emptyLabel="Sin etiqueta"
                    options={facets?.tags ?? []}
                    selected={params.etiqueta}
                    title="Etiqueta"
                    onChange={(values) => setFilter({ etiqueta: values.length ? values : null })}
                  />
                  {filtered ? (
                    <Button size="sm" variant="ghost" onClick={clearFilters}>
                      Limpiar
                    </Button>
                  ) : null}
                </div>
              </div>

              <TabsPrimitive.Content ref={swipeTabs} className="mt-3 outline-none" tabIndex={-1} value={params.estado}>
                <AttendeesTable
                  empty={<NoAttendees filtered={filtered} onClear={clearFilters} />}
                  error={list.error}
                  eventId={eventId}
                  loading={list.isPending || list.isPlaceholderData}
                  page={params.pagina}
                  pageSize={PAGE_SIZE}
                  rows={list.data?.rows}
                  sort={SORT_OF[params.orden]}
                  tags={facets?.tags.map((tag) => tag.value) ?? []}
                  timezone={timezone}
                  total={total}
                  onPage={(page) => void setParams({ pagina: page > 1 ? page : null })}
                  onRetry={() => void list.refetch()}
                  onSort={sortBy}
                />
              </TabsPrimitive.Content>
            </TabsPrimitive.Root>

            <aside
              aria-label="La puerta y los sorteos"
              className="grid gap-4 md:grid-cols-2 xl:sticky xl:top-4 xl:grid-cols-1"
            >
              <ArrivalsFeed
                entries={recent.data}
                error={recent.error}
                timezone={timezone}
                onRetry={() => void recent.refetch()}
              />
              <RafflesPanel
                error={raffles.error}
                eventId={eventId}
                raffles={raffles.data}
                timezone={timezone}
                onRetry={() => void raffles.refetch()}
              />
            </aside>
          </div>
        </>
      )}

      <DoorsPanel
        eventName={eventName}
        open={doorsOpen}
        scannerHref={scannerHref}
        stats={stats.data}
        sync={state}
        webhookUrl={webhookUrl}
        onOpenChange={setDoorsOpen}
      />
    </PageContainer>
  );
}

/** Filters, search, tab, sort and page live in the URL, so a view can be shared or reloaded as it is. */
export default function AttendeesClient(props: Props) {
  return (
    <NuqsAdapter>
      <Attendees {...props} />
    </NuqsAdapter>
  );
}
