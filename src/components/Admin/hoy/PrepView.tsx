"use client";

import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowUpRight, CircleCheck, ExternalLink, ListChecks, MapPin, UserPlus } from "lucide-react";

import { cn } from "app/lib/utils";
import { AreaChart } from "components/Admin/ui/charts";
import { Meter, MicroLabel, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { formatClock, RelativeTime, useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import type { Today } from "lib/orpc/dashboard/today-schemas";
import type { ShellStatus } from "lib/orpc/shell/schemas";

import { ActivityRow } from "./parts";

const DAY_MS = 86_400_000;

const shortDay = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", timeZone }).format(at).replace(/\./g, "");

/** The conf's own identity on the hero card: big digits, the yellow circle, the blue triangle. */
export function Countdown({
  startDate,
  timeZone,
  venue,
}: {
  startDate: string;
  timeZone: string;
  venue: string | null;
}) {
  const now = useNow(30_000);
  const left = Math.max(0, new Date(startDate).getTime() - (now || Date.now()));
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const digit = (value: number, label: string, accent = false) => (
    <div
      className={cn(
        "flex size-[74px] flex-col items-center justify-center rounded-[10px]",
        accent ? "bg-primary text-primary-foreground" : "border border-input bg-background text-foreground"
      )}
    >
      <span className="font-display text-[30px] leading-none font-extrabold tabular-nums" suppressHydrationWarning>
        {now ? String(value).padStart(2, "0") : "--"}
      </span>
      <span
        className={cn(
          "mt-1 font-display text-[9px] font-bold tracking-[0.14em]",
          accent ? "text-primary-foreground/80" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </div>
  );

  return (
    <Panel className="relative p-4">
      <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full bg-primary/90" />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-6 size-0 border-y-[34px] border-l-[52px] border-y-transparent border-l-info"
      />
      <div className="relative">
        <MicroLabel>Cuenta regresiva</MicroLabel>
        <div className="mt-3 flex gap-2">
          {digit(days, "DÍAS", true)}
          {digit(hours, "HORAS")}
          {digit(minutes, "MIN")}
        </div>
        <p className="mt-3 flex items-center gap-2 text-meta text-muted-foreground">
          <MapPin aria-hidden className="size-3.5" />
          {new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long", timeZone })
            .format(new Date(startDate))
            .replace(",", "")}{" "}
          · {formatClock(new Date(startDate), timeZone)}
          {venue ? ` · ${venue}` : ""}
        </p>
      </div>
    </Panel>
  );
}

/** Before the day: what is still missing, how registrations go, who is on the team. */
export function PrepView({
  data,
  status,
  href,
  communitySlug,
}: {
  data: Today;
  status: ShellStatus | undefined;
  href: (path: string) => string;
  communitySlug: string;
}) {
  const { event, registrations, activity, coverage, comms } = data;
  const tz = event.timezone;
  const start = new Date(event.startDate);
  const prep = status?.prep ?? [];
  const done = prep.filter((item) => item.done).length;
  const pending = prep.filter((item) => !item.done);
  const milestones = [
    {
      at: new Date(start.getTime() - 7 * DAY_MS),
      title: "Email a inscriptos",
      meta: "agenda, mapa y cómo llegar (T-7)",
    },
    {
      at: new Date(start.getTime() - 3 * DAY_MS),
      title: "Congelar cambios en vivo",
      meta: "sin deploys a pantallas, OBS ni kioscos",
    },
    {
      at: new Date(start.getTime() - 2 * DAY_MS),
      title: "Ensayo general",
      meta: "OBS, pantallas y simulacro de check-in",
    },
    { at: start, title: event.name, meta: `${formatClock(start, tz)} · abre la acreditación`, event: true },
  ];
  const nextMilestone = milestones.findIndex((milestone) => milestone.at.getTime() > Date.now());

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <a
                href={`/comunidad/${communitySlug}/events/${status?.event.slug ?? ""}`}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink />
                Ver sitio
              </a>
            </Button>
            <Button asChild>
              <Link href={`/admin/communities/${communitySlug}#miembros`}>
                <UserPlus />
                Invitar staff
              </Link>
            </Button>
          </>
        }
        description={`Lo que falta para ${event.name}. El día del evento, esta página se convierte en el panel en vivo.`}
        meta={
          <>
            <Badge>
              {status ? (status.daysLeft === 1 ? "Falta 1 día" : `Faltan ${status.daysLeft} días`) : "Antes del evento"}
            </Badge>
            <span className="font-terminal text-meta text-muted-foreground">
              {new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short", timeZone: tz })
                .format(start)
                .replace(/\./g, "")
                .replace(",", "")}{" "}
              · {formatClock(start, tz)}
            </span>
          </>
        }
        title="Preparación"
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
            <Countdown startDate={event.startDate} timeZone={tz} venue={null} />
            <Panel className="min-w-0 p-4">
              <div className="flex items-center gap-3">
                <MicroLabel>Inscripciones</MicroLabel>
                {registrations?.syncedAt ? (
                  <span className="ml-auto text-2xs text-muted-foreground">
                    Eventbrite · <RelativeTime className="text-2xs" date={registrations.syncedAt} />
                  </span>
                ) : null}
              </div>
              {registrations ? (
                <>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[26px] font-semibold text-foreground">{registrations.attending}</span>
                    <span className="text-meta text-success-foreground">
                      +{registrations.today} hoy · +{registrations.week} esta semana
                    </span>
                  </div>
                  <div className="mt-3">
                    <AreaChart
                      height={110}
                      label="Inscripciones acumuladas, últimos 30 días"
                      points={registrations.series.map((point) => ({
                        label: shortDay(new Date(`${point.day}T12:00:00Z`), "UTC"),
                        value: point.total,
                      }))}
                    />
                  </div>
                </>
              ) : (
                <div className="flex h-[150px] flex-col items-start justify-center gap-2">
                  <p className="text-ui text-muted-foreground">Eventbrite todavía no está sincronizado.</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={href("/admin/attendees")}>Conectar Eventbrite</Link>
                  </Button>
                </div>
              )}
            </Panel>
          </div>

          {prep.length > 0 && pending.length > 0 ? (
            <Panel>
              <PanelHead
                actions={<Meter className="w-28" label="Preparación" max={prep.length} value={done} />}
                icon={ListChecks}
                meta={`${done} de ${prep.length}`}
                title="Lista de preparación"
              />
              <ul className="grid divide-border md:grid-cols-2 md:divide-x">
                {[prep.slice(0, Math.ceil(prep.length / 2)), prep.slice(Math.ceil(prep.length / 2))].map(
                  (column, index) => (
                    <li key={index} className="divide-y divide-border">
                      {column.map((item) => (
                        <div key={item.key} className="flex items-center gap-3 px-4 py-2.5">
                          {item.done ? (
                            <CircleCheck aria-label="Listo" className="size-[18px] shrink-0 text-success" />
                          ) : (
                            <span
                              aria-label="Pendiente"
                              className="size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-faint"
                              role="img"
                            />
                          )}
                          <div className="min-w-0 flex-1 leading-tight">
                            <p
                              className={cn(
                                "truncate text-ui",
                                item.done ? "text-muted-foreground" : "text-foreground"
                              )}
                            >
                              {item.title}
                            </p>
                            <p className="truncate text-meta text-faint">{item.meta}</p>
                          </div>
                          {!item.done ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={href(item.href)}>Resolver</Link>
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </li>
                  )
                )}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <PanelHead icon={Activity} meta="últimos cambios" title="Actividad del equipo" />
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-center text-meta text-muted-foreground">
                Todavía no hay cambios registrados.
              </p>
            ) : (
              <div className="grid py-1 md:grid-cols-2">
                {activity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="p-4">
            <MicroLabel className="mb-3 block">Próximos hitos</MicroLabel>
            <ol>
              {milestones.map((milestone, index) => {
                const isNext = index === nextMilestone;
                return (
                  <li key={milestone.title} className="relative flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1 size-2.5 rounded-full",
                          milestone.event
                            ? "bg-live shadow-[0_0_0_4px_hsl(var(--live)/0.15)]"
                            : isNext
                              ? "bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
                              : milestone.at.getTime() < Date.now()
                                ? "bg-success"
                                : "border border-input bg-background"
                        )}
                      />
                      {index < milestones.length - 1 ? (
                        <span aria-hidden className="mt-1 w-px flex-1 bg-input" />
                      ) : null}
                    </div>
                    <div className="-mt-0.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-ui", isNext && "font-medium")}>{milestone.title}</span>
                        <span className={cn("shrink-0 font-terminal text-2xs", isNext ? "text-primary" : "text-faint")}>
                          {shortDay(milestone.at, tz)}
                        </span>
                      </div>
                      <p className="text-meta text-muted-foreground">{milestone.meta}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel className="space-y-2.5 p-4">
            <div className="mb-1 flex items-center justify-between">
              <MicroLabel>Staff por tarea</MicroLabel>
              <span className="font-terminal text-2xs text-muted-foreground">
                {coverage.reduce((sum, row) => sum + Math.min(row.have, row.need), 0)} /{" "}
                {coverage.reduce((sum, row) => sum + row.need, 0)}
              </span>
            </div>
            {coverage.length === 0 ? (
              <p className="text-meta text-muted-foreground">Ninguna tarea pide un mínimo de gente.</p>
            ) : (
              coverage.map((row) => (
                <div key={row.group} className="flex items-center gap-3 text-meta">
                  <span className="w-[110px] truncate text-subtle">{row.group}</span>
                  <Meter
                    className="flex-1"
                    max={row.need}
                    tone={row.have >= row.need ? "success" : "warning"}
                    value={row.have}
                  />
                  <span
                    className={cn(
                      "w-9 text-right font-terminal text-2xs",
                      row.have >= row.need ? "text-success-foreground" : "text-warning-foreground"
                    )}
                  >
                    {row.have}/{row.need}
                  </span>
                </div>
              ))
            )}
            <Button asChild className="mt-1 w-full" size="sm" variant="ghost">
              <Link href={href("/admin/tareas")}>
                Ver turnos
                <ArrowUpRight />
              </Link>
            </Button>
          </Panel>

          <Panel className="flex gap-3 p-4">
            <Image
              alt=""
              className="size-14 shrink-0 rounded-[10px] bg-primary/15 object-contain p-1 ring-1 ring-primary/20"
              height={112}
              src="/images/logos/carpincho.png"
              width={112}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-ui font-semibold">Owy</span>
                <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <StatusDot tone={comms.channels.telegram ? "ok" : "idle"} />
                  Telegram
                </span>
                <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <StatusDot tone={comms.channels.slack ? "ok" : "idle"} />
                  Slack
                </span>
              </div>
              {comms.nextScheduled ? (
                <>
                  <p className="mt-1 text-meta text-muted-foreground">
                    Próximo mensaje · <RelativeTime date={comms.nextScheduled.scheduledAt} />
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-ui">“{comms.nextScheduled.body}”</p>
                </>
              ) : comms.lastSent ? (
                <>
                  <p className="mt-1 text-meta text-muted-foreground">
                    Último mensaje · <RelativeTime date={comms.lastSent.sentAt} />
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-ui">“{comms.lastSent.body}”</p>
                </>
              ) : (
                <p className="mt-1 text-meta text-muted-foreground">Sin mensajes programados para los asistentes.</p>
              )}
              <Link
                className="touch-target mt-2 inline-flex items-center gap-1 text-meta text-info-foreground hover:underline"
                href={href("/admin/comunicacion")}
              >
                Programar mensajes
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
