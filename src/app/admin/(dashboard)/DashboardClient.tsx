"use client";

import type React from "react";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpRight,
  CalendarClock,
  ExternalLink,
  Map,
  Monitor,
  Music2,
  RefreshCw,
  StickyNote,
  Timer,
} from "lucide-react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

import { orpc } from "lib/orpc";
import { scopedAdminHref, useSelectedEvent } from "components/Admin/shell/use-selected-event";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "components/shared/ui/chart";
import { Empty } from "components/shared/ui/empty";
import { Progress } from "components/shared/ui/progress";
import { Skeleton } from "components/shared/ui/skeleton";
import { cn } from "app/lib/utils";

const STATUS_DISPLAY = {
  active: { text: "En curso", dot: "bg-emerald-500" },
  upcoming: { text: "Próximamente", dot: "bg-primary" },
  inactive: { text: "Inactivo", dot: "bg-muted-foreground" },
} as const;

const ROOMS_CHART_CONFIG = {
  sessions: {
    label: "Charlas",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

/** Event screens are built from the selected event — never pinned to one org. */
function quickAccessFor(event: { communitySlug: string; slug: string } | null) {
  const staticItems = [
    { title: "Pantalla OBS", href: "/admin/screen", icon: Monitor, external: false },
    { title: "Launchpad", href: "/admin/launchpad", icon: Music2, external: false },
  ];
  if (!event) return staticItems;

  const base = `/comunidad/${event.communitySlug}/events/${event.slug}`;

  return [
    ...staticItems,
    { title: "Kiosk · Grilla", href: `${base}/kiosk`, icon: CalendarClock, external: true },
    { title: "Kiosk · Mapa", href: `${base}/kiosk/map`, icon: Map, external: true },
    { title: "Pantalla · Sticky note", href: `${base}/stickynote`, icon: StickyNote, external: true },
    { title: "Pantalla · Countdown", href: `${base}/countdown`, icon: Timer, external: true },
  ];
}

function Stat({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-terminal text-3xl font-semibold tabular-nums leading-none text-foreground">{value}</span>
      {detail ? <span className="mt-0.5 text-xs text-muted-foreground">{detail}</span> : null}
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-px p-0 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 px-5 py-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[280px] lg:col-span-2" />
        <Skeleton className="h-[280px]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[240px] lg:col-span-2" />
        <Skeleton className="h-[240px]" />
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const { selected } = useSelectedEvent();
  const boardHref = selected
    ? scopedAdminHref(selected.communitySlug, "/admin/openspace", selected.slug)
    : "/admin/openspace";
  const quickAccess = quickAccessFor(selected);
  const {
    data: stats,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery(
    orpc.dashboard.getStats.queryOptions({
      input: {},
      staleTime: 30_000,
      refetchInterval: 60_000,
    })
  );

  const event = stats?.event ?? null;
  const status = STATUS_DISPLAY[event?.status ?? "inactive"];
  const eventbrite = stats?.eventbrite ?? null;
  const checkinPct =
    eventbrite && eventbrite.totalParticipants > 0
      ? Math.round((eventbrite.checkedIn / eventbrite.totalParticipants) * 100)
      : 0;
  const occupancyPct = stats ? Math.round(stats.gridOccupancy * 100) : 0;
  const nowBlock = stats?.currentSchedule ?? stats?.nextSchedule ?? null;
  const nowBlockIsCurrent = Boolean(stats?.currentSchedule);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Resumen</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {event ? (
              <>
                <span>{event.name}</span>
                <Badge className="gap-1.5 font-normal" variant="outline">
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                  {status.text}
                </Badge>
              </>
            ) : isLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <span>Sin evento configurado</span>
            )}
          </div>
        </div>
        {event?.startDate ? (
          <p className="font-terminal text-xs tabular-nums text-muted-foreground">
            {format(event.startDate, "d MMM yyyy", { locale: es })}
            {event.endDate && event.endDate.toDateString() !== event.startDate.toDateString()
              ? ` — ${format(event.endDate, "d MMM yyyy", { locale: es })}`
              : null}
          </p>
        ) : null}
      </div>

      {isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div>
              <p className="font-medium text-foreground">No se pudieron cargar las estadísticas</p>
              <p className="text-sm text-muted-foreground">Revisá la conexión con la base de datos.</p>
            </div>
            <Button disabled={isRefetching} variant="outline" onClick={() => refetch()}>
              <RefreshCw className={cn(isRefetching && "animate-spin")} />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : isLoading || !stats ? (
        <DashboardSkeleton />
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 divide-y divide-border p-0 md:grid-cols-4 md:divide-x md:divide-y-0">
              <Stat
                detail={
                  eventbrite ? `${eventbrite.checkedIn} con check-in · ${checkinPct}%` : "Eventbrite no disponible"
                }
                label="Asistentes"
                value={eventbrite ? eventbrite.totalParticipants : "—"}
              >
                {eventbrite ? <Progress className="mt-2 h-1" value={checkinPct} /> : null}
              </Stat>
              <Stat detail={`en ${stats.totalSchedules} bloques`} label="Charlas" value={stats.totalSessions} />
              <Stat
                detail={`${stats.totalSessions}/${stats.gridCells} lugares`}
                label="Ocupación de la grilla"
                value={`${occupancyPct}%`}
              />
              <Stat detail="salas activas" label="Salas" value={stats.activeRooms} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Charlas por sala</CardTitle>
                <CardDescription>Distribución de sesiones en la grilla</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.sessionsByRoom.length === 0 ? (
                  <Empty
                    description="Creá salas desde el Open Space para ver la distribución."
                    icon={Map}
                    title="Sin salas configuradas"
                  />
                ) : (
                  <ChartContainer
                    className="w-full"
                    config={ROOMS_CHART_CONFIG}
                    style={{ height: Math.max(160, stats.sessionsByRoom.length * 44) }}
                  >
                    <BarChart
                      accessibilityLayer
                      data={stats.sessionsByRoom}
                      layout="vertical"
                      margin={{ left: 8, right: 32 }}
                    >
                      <XAxis hide type="number" />
                      <YAxis
                        axisLine={false}
                        dataKey="room"
                        tickLine={false}
                        tickMargin={8}
                        type="category"
                        width={90}
                      />
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
                      <Bar
                        barSize={20}
                        dataKey="sessions"
                        fill="var(--color-sessions)"
                        isAnimationActive={false}
                        radius={4}
                      >
                        <LabelList
                          className="fill-foreground font-terminal tabular-nums"
                          dataKey="sessions"
                          fontSize={12}
                          position="right"
                        />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{nowBlockIsCurrent ? "Ahora" : "Próximo bloque"}</CardTitle>
                <CardDescription>Grilla del Open Space</CardDescription>
              </CardHeader>
              <CardContent className="flex h-[calc(100%-5.5rem)] flex-col justify-between gap-4">
                {nowBlock ? (
                  <div className="space-y-2">
                    <p className="font-terminal text-2xl tabular-nums text-foreground">
                      {nowBlock.startTime} – {nowBlock.endTime}
                    </p>
                    <p className="text-sm text-muted-foreground">{nowBlock.name}</p>
                    {stats.highlightedSchedule ? (
                      <Badge className="gap-1.5 font-normal" variant="outline">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                        En kiosk: {stats.highlightedSchedule.startTime} – {stats.highlightedSchedule.endTime}
                      </Badge>
                    ) : (
                      <p className="text-xs text-muted-foreground">Ningún bloque resaltado en el kiosk</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay bloques programados.</p>
                )}
                <Button asChild className="w-fit" variant="outline">
                  <Link href={boardHref}>
                    Abrir Open Space
                    <ArrowUpRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Actividad reciente</CardTitle>
                <CardDescription>Últimas charlas creadas o editadas</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.recentTracks.length === 0 ? (
                  <Empty
                    description="Las charlas nuevas van a aparecer acá."
                    icon={StickyNote}
                    title="Sin actividad todavía"
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {stats.recentTracks.map((track) => (
                      <li
                        key={track.id}
                        className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[track.speaker, track.room, track.timeSlot].filter(Boolean).join(" · ") || "Sin detalles"}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDistanceToNow(track.updatedAt, { addSuffix: true, locale: es })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accesos rápidos</CardTitle>
                <CardDescription>Operación en vivo y pantallas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {quickAccess.map((item) => {
                  const inner = (
                    <>
                      <item.icon aria-hidden className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm text-foreground">{item.title}</span>
                      {item.external ? (
                        <ExternalLink aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </>
                  );
                  const className = "flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent";

                  return item.external ? (
                    <a key={item.href} className={className} href={item.href} rel="noopener noreferrer" target="_blank">
                      {inner}
                    </a>
                  ) : (
                    <Link key={item.href} className={className} href={item.href}>
                      {inner}
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
