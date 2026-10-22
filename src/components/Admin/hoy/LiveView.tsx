"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CircleArrowRight,
  CircleCheck,
  CircleDashed,
  DoorOpen,
  HardHat,
  LayoutGrid,
  ListVideo,
  Megaphone,
  Play,
  Plus,
  Siren,
  TimerReset,
  TvMinimal,
  TriangleAlert,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Meter, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { AvatarStack } from "components/Admin/ui/person";
import { Sparkline } from "components/Admin/ui/charts";
import { EmptyState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { formatClock, formatDuration, formatRelative, useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import type { Today, TodayMoment } from "lib/orpc/dashboard/today-schemas";

import { ActivityRow, IncidentRow, Kpi, screenLabel } from "./parts";

const dayLabel = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short", timeZone })
    .format(new Date(iso))
    .replace(/\./g, "")
    .replace(",", "");

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const endOf = (start: string, minutes: number) => {
  const total = toMinutes(start) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

function MomentRow({
  moment,
  state,
  timeZone,
}: {
  moment: TodayMoment;
  state: "done" | "live" | "next" | "later";
  timeZone: string;
}) {
  const started = moment.actualStart ? formatClock(new Date(moment.actualStart), timeZone) : null;
  const meta = [moment.location, moment.owner?.name.split(" ")[0], started && `arrancó ${started}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "grid grid-cols-[52px_18px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5",
        state === "next" && "bg-primary-surface/50"
      )}
    >
      <span
        className={cn(
          "font-terminal text-meta tabular-nums",
          state === "done" ? "text-faint" : state === "live" ? "text-foreground" : "text-subtle"
        )}
      >
        {moment.plannedStart}
      </span>
      <span className="flex justify-center">
        {state === "done" ? (
          <CircleCheck aria-label="Hecho" className="size-4 text-success" />
        ) : state === "live" ? (
          <StatusDot pulse ring tone="live" />
        ) : state === "next" ? (
          <CircleArrowRight aria-label="Siguiente" className="size-4 text-primary" />
        ) : (
          <span aria-hidden className="size-2 rounded-full border border-input" />
        )}
      </span>
      <div className="min-w-0">
        <p className={cn("truncate text-ui", state === "done" ? "text-muted-foreground" : "text-foreground")}>
          {moment.title}
          {moment.fixed ? <span className="ml-1.5 font-terminal text-2xs text-faint">fijo</span> : null}
        </p>
        {meta ? <p className="truncate text-meta text-muted-foreground">{meta}</p> : null}
      </div>
      <div className="flex items-center gap-1.5">
        {moment.cueName ? <Badge variant="secondary">{moment.cueName}</Badge> : null}
        {moment.owyMessage ? <Badge variant="info">Owy</Badge> : null}
      </div>
    </div>
  );
}

/** Mission control: what is happening at the event right now. */
export function LiveView({
  data,
  href,
  stale,
  going,
  onGo,
  onShift,
}: {
  data: Today;
  /** A canonical admin path ("/admin/guion") scoped to this event. */
  href: (path: string) => string;
  stale: boolean;
  going: boolean;
  /** GO for the next moment of the run of show. */
  onGo: () => void;
  /** Correr +5′ from the moment on (absent when there's nothing to move). */
  onShift?: () => void;
}) {
  const now = useNow(15_000);
  const { event, checkins, slot, rooms, staff, urgent, onAir, rundown, incidents, activity, screens } = data;
  // Between blocks the useful view is what comes next; the operator can still flip it.
  const [chosenView, setRoomsView] = useState<"now" | "next" | null>(null);
  const roomsView = chosenView ?? (slot.current ? "now" : "next");
  const tz = event.timezone;
  const nowMin = now ? toMinutes(formatClock(now, tz)) : 0;
  const inUse = rooms.filter((room) => room.current).length;
  const slotLeft = slot.current ? Math.max(0, toMinutes(slot.current.end) - nowMin) : 0;
  const slotLength = slot.current ? Math.max(1, toMinutes(slot.current.end) - toMinutes(slot.current.start)) : 1;
  const pct = checkins && checkins.attending > 0 ? Math.round((checkins.checkedIn / checkins.attending) * 100) : 0;

  return (
    <div className={cn("transition-opacity", stale && "opacity-60")}>
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${href("/admin/incidentes")}&nuevo=1`}>
                <Siren />
                Reportar incidente
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${href("/admin/comunicacion")}&nuevo=1`}>
                <Megaphone />
                Anunciar
              </Link>
            </Button>
            {rundown.next ? (
              <Button className="max-w-[22rem]" disabled={going} onClick={onGo}>
                <Play />
                <span className="truncate">GO · {rundown.next.title}</span>
              </Button>
            ) : (
              <Button asChild>
                <Link href={href("/admin/guion")}>
                  <ListVideo />
                  Guion del día
                </Link>
              </Button>
            )}
          </>
        }
        description={`Todo lo que pasa en ${event.name} ahora: salas, guion, staff, pantallas e incidentes.`}
        meta={
          <>
            <Badge variant="destructive">
              <StatusDot pulse tone="live" />
              En vivo
            </Badge>
            <span className="font-terminal text-meta text-muted-foreground">
              {dayLabel(event.startDate, tz)}
              {slot.current ? ` · bloque ${slot.index} de ${slot.total}` : ""}
            </span>
          </>
        }
        title="Hoy"
      />

      <Panel className="grid grid-cols-2 divide-border max-lg:divide-y lg:grid-cols-[1.25fr_1fr_1.1fr_1.1fr_1.45fr] lg:divide-x">
        <Kpi
          aside={checkins && checkins.last15 > 0 ? <Badge variant="success">+{checkins.last15} · 15′</Badge> : null}
          className="max-lg:col-span-2"
          label="Acreditados"
          of={checkins ? `/ ${checkins.attending}` : undefined}
          value={checkins ? checkins.checkedIn : "—"}
        >
          {checkins ? (
            <>
              <div className="-mt-7 flex justify-end">
                <Sparkline label="Acreditados cada 5 minutos, última hora" values={checkins.lastHour} />
              </div>
              <Meter className="mt-2" label="Acreditados" max={100} value={pct} />
            </>
          ) : (
            <p className="mt-2.5 text-meta text-muted-foreground">Eventbrite sin sincronizar</p>
          )}
        </Kpi>
        <Kpi
          aside={<DoorOpen aria-hidden className="size-3.5 text-faint" />}
          label="En salas"
          of={`/ ${rooms.length} salas`}
          value={inUse}
        >
          <p className="mt-2.5 text-meta text-muted-foreground">
            {slot.current ? (
              <>
                {rooms.length - inUse > 0
                  ? `${rooms.length - inUse} libre${rooms.length - inUse > 1 ? "s" : ""} · `
                  : ""}
                termina <span className="font-terminal text-subtle">{slot.current.end}</span>
              </>
            ) : slot.next ? (
              <>
                sigue <span className="font-terminal text-subtle">{slot.next.start}</span>
              </>
            ) : (
              "sin bloques ahora"
            )}
          </p>
        </Kpi>
        <Kpi
          aside={<HardHat aria-hidden className="size-3.5 text-faint" />}
          label="Staff en turno"
          of={`/ ${staff.expected}`}
          value={staff.onSite}
        >
          <div className="mt-2 flex items-center justify-between gap-2">
            <span
              className={cn(
                "truncate text-meta",
                staff.late.length ? "text-warning-foreground" : "text-muted-foreground"
              )}
            >
              {staff.late.length
                ? `${staff.late.length} atrasad${staff.late.length > 1 ? "as" : "a"}`
                : staff.free.length
                  ? `${staff.free.length} libres ahora`
                  : "todos en su lugar"}
            </span>
            <AvatarStack
              details={staff.late.length ? "Atrasadas" : "Llegaron hace poco"}
              max={3}
              people={(staff.late.length ? staff.late : staff.recent).map((person) => ({
                ...person,
                title: "task" in person ? `${person.name} · ${person.task}` : person.name,
              }))}
              size={20}
            />
          </div>
        </Kpi>
        <Kpi
          aside={<Megaphone aria-hidden className="size-3.5 text-faint" />}
          // Below lg the strip is two columns: the fourth cell takes the row instead of leaving a hole.
          className="max-lg:col-span-2"
          label="Anuncio urgente"
          of={urgent ? `/ ${urgent.expected} recibieron` : undefined}
          value={urgent ? urgent.acked : "—"}
        >
          {urgent ? (
            <div className="mt-2.5 flex items-center justify-between gap-2 text-meta whitespace-nowrap">
              <span className="truncate text-muted-foreground">“{urgent.body}”</span>
              {urgent.pending.length ? (
                <span className="text-info-foreground">{urgent.pending.length} faltan</span>
              ) : null}
            </div>
          ) : (
            <p className="mt-2.5 text-meta text-muted-foreground">Ninguno hoy</p>
          )}
        </Kpi>
        <div className="col-span-2 flex min-w-0 gap-3 p-3.5 lg:col-span-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-terminal text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">
                Al aire
              </span>
              {onAir && onAir.scene !== "black" ? <StatusDot pulse ring tone="live" /> : <StatusDot tone="idle" />}
            </div>
            <p className="mt-1.5 truncate text-ui font-medium text-foreground">
              {onAir ? (onAir.scene === "black" ? "Pantalla en negro" : onAir.sceneTitle) : "—"}
            </p>
            {onAir ? (
              <p className="mt-0.5 font-terminal text-2xs text-muted-foreground">
                pared · {now ? formatRelative(new Date(onAir.since).getTime() - now) : ""}
              </p>
            ) : null}
            <p
              className={cn(
                "mt-1.5 flex items-center gap-1.5 font-terminal text-2xs whitespace-nowrap",
                onAir?.streaming ? "text-success-foreground" : "text-muted-foreground"
              )}
            >
              <StatusDot tone={onAir?.streaming ? "ok" : onAir?.obsConnected ? "warn" : "idle"} />
              {onAir?.streaming
                ? "transmitiendo"
                : onAir?.obsConnected
                  ? "OBS conectado, sin stream"
                  : "OBS desconectado"}
            </p>
          </div>
          {onAir && onAir.scene !== "black" ? (
            <Image
              alt=""
              className="h-14 w-24 shrink-0 self-center rounded-md object-cover ring-1 ring-live/60"
              height={56}
              src={`/owy-stage/thumbs/${onAir.scene}.jpg`}
              width={96}
            />
          ) : null}
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <PanelHead
              actions={
                <>
                  <div className="inline-flex rounded-lg border border-input bg-background p-0.5" role="tablist">
                    {(["now", "next"] as const).map((view) => (
                      <button
                        key={view}
                        aria-selected={roomsView === view}
                        className={cn(
                          "touch-target h-6 rounded-md px-2.5 text-meta font-medium text-muted-foreground transition-colors pointer-coarse:h-8",
                          roomsView === view && "bg-raised text-foreground shadow-[inset_0_0_0_1px_hsl(var(--input))]"
                        )}
                        role="tab"
                        type="button"
                        onClick={() => setRoomsView(view)}
                      >
                        {view === "now" ? "Ahora" : "Siguiente"}
                      </button>
                    ))}
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link aria-label="Abrir agenda" href={href("/admin/openspace")}>
                      {/* Phones have Agenda in the tab bar; the title needs the room. */}
                      <span className="max-md:hidden">Abrir agenda</span>
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </>
              }
              icon={LayoutGrid}
              meta={
                roomsView === "now"
                  ? slot.current
                    ? `${slot.current.name} · ${slot.current.start} – ${slot.current.end}`
                    : "Ningún bloque ahora"
                  : slot.next
                    ? `${slot.next.name} · ${slot.next.start} – ${slot.next.end}`
                    : "No hay más bloques"
              }
              title="Ahora en salas"
            />
            {rooms.length === 0 ? (
              <EmptyState compact icon={LayoutGrid} title="Sin salas" description="Creá las salas desde la agenda." />
            ) : (
              <div className="divide-y divide-border">
                {rooms.map((room) => {
                  const talk = roomsView === "now" ? room.current : room.next;
                  return (
                    <div
                      key={room.id}
                      className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4 px-4 py-2.5 md:grid-cols-[132px_minmax(0,1fr)_150px_190px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="h-7 w-[3px] shrink-0 rounded-full"
                          style={{ background: room.color ?? "hsl(var(--faint))" }}
                        />
                        <div className="min-w-0 leading-tight">
                          <p className="truncate text-ui font-medium text-foreground">{room.name}</p>
                          {room.capacity ? (
                            <p className="font-terminal text-2xs text-faint">{room.capacity} pers.</p>
                          ) : null}
                        </div>
                      </div>
                      {talk ? (
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-ui font-medium text-foreground">{talk.title}</span>
                            {room.status === "full" ? <Badge variant="warning">Llena</Badge> : null}
                            {room.status === "evacuate" ? (
                              <Badge variant="destructive">
                                <TriangleAlert />
                                Evacuar
                              </Badge>
                            ) : null}
                            {room.openIncident ? (
                              <Badge className="max-w-48" title={room.openIncident} variant="destructive">
                                <Siren />
                                <span className="truncate">{room.openIncident}</span>
                              </Badge>
                            ) : null}
                          </div>
                          {"speaker" in talk && talk.speaker ? (
                            <p className="truncate text-meta text-muted-foreground">{talk.speaker}</p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui text-faint">
                          <CircleDashed aria-hidden className="size-4" />
                          {/* On a phone the button goes under it rather than breaking "Sala libre" in two. */}
                          <span className="whitespace-nowrap">Sala libre</span>
                          <Button asChild size="xs" variant="ghost">
                            <Link href={href("/admin/openspace")}>
                              <Plus />
                              Ubicar charla
                            </Link>
                          </Button>
                        </div>
                      )}
                      <div
                        className={cn("max-md:hidden", (!talk || roomsView === "next" || !slot.current) && "invisible")}
                      >
                        <div className="flex items-center justify-between font-terminal text-2xs">
                          <span className="text-muted-foreground">restan</span>
                          <span className="text-subtle tabular-nums">{formatDuration(slotLeft * 60_000)}</span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${((slotLength - slotLeft) / slotLength) * 100}%`,
                              background: room.color ?? "hsl(var(--primary))",
                            }}
                          />
                        </div>
                      </div>
                      <div className="min-w-0 text-right leading-tight max-md:hidden">
                        {roomsView === "now" ? (
                          <>
                            <p className="font-terminal text-2xs text-faint">{slot.next?.start ?? "—"}</p>
                            <p className={cn("truncate text-meta", room.next ? "text-subtle" : "text-faint")}>
                              {room.next?.title ?? "Libre"}
                            </p>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHead
              actions={
                <>
                  {onShift ? (
                    <Button size="sm" variant="outline" onClick={onShift}>
                      <TimerReset />
                      Correr +5′
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={href("/admin/guion")}>
                      Ver guion
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </>
              }
              icon={ListVideo}
              meta={
                rundown.driftMin ? (
                  <span className={rundown.driftMin > 0 ? "text-warning-foreground" : "text-success-foreground"}>
                    {rundown.driftMin > 0
                      ? `+${rundown.driftMin} min de atraso`
                      : `${-rundown.driftMin} min adelantados`}
                  </span>
                ) : undefined
              }
              title="Guion del día"
            />
            {rundown.total === 0 ? (
              <EmptyState
                compact
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href={href("/admin/guion")}>Armar el guion</Link>
                  </Button>
                }
                icon={ListVideo}
                title="Todavía no hay guion"
              />
            ) : (
              <div className="divide-y divide-border">
                {rundown.current ? <MomentRow moment={rundown.current} state="live" timeZone={tz} /> : null}
                {rundown.next ? <MomentRow moment={rundown.next} state="next" timeZone={tz} /> : null}
                {rundown.upcoming.map((moment) => (
                  <MomentRow key={moment.id} moment={moment} state="later" timeZone={tz} />
                ))}
                {!rundown.current && !rundown.next ? (
                  <p className="px-4 py-3 text-meta text-muted-foreground">El guion terminó por hoy.</p>
                ) : null}
              </div>
            )}
            {rundown.next ? (
              <p className="border-t border-border px-4 py-2 font-terminal text-2xs text-faint">
                {rundown.next.title} · {rundown.next.plannedStart} –{" "}
                {endOf(rundown.next.plannedStart, rundown.next.durationMin)}
              </p>
            ) : null}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <PanelHead
              actions={
                <Button asChild aria-label="Reportar incidente" size="icon-sm" variant="ghost">
                  <Link href={`${href("/admin/incidentes")}&nuevo=1`}>
                    <Plus />
                  </Link>
                </Button>
              }
              icon={Siren}
              meta={incidents.open ? `${incidents.open} abierto${incidents.open > 1 ? "s" : ""}` : undefined}
              title="Incidentes"
            />
            {incidents.items.length === 0 ? (
              <EmptyState
                compact
                owy
                description="Nada abierto. Owy sigue tomando mate y mirando."
                title="Todo tranquilo"
              />
            ) : (
              <div className="divide-y divide-border">
                {incidents.items.map((incident) => (
                  <Link
                    key={incident.id}
                    className="block transition-colors hover:bg-white/[0.02]"
                    href={`${href("/admin/incidentes")}&incidente=${incident.id}`}
                  >
                    <IncidentRow incident={incident} />
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHead
              actions={
                <span className="flex items-center gap-1.5 font-terminal text-2xs text-muted-foreground">
                  <StatusDot tone={stale ? "warn" : "ok"} />
                  {stale ? "sin datos nuevos" : "en vivo"}
                </span>
              }
              icon={Activity}
              title="Actividad"
            />
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-center text-meta text-muted-foreground">Todavía no pasó nada.</p>
            ) : (
              <div className="py-1">
                {activity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </Panel>

          <Panel className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-terminal text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">
                <TvMinimal aria-hidden className="size-3.5" />
                Pantallas
              </span>
              <Link
                className="touch-target font-terminal text-2xs text-muted-foreground hover:text-foreground"
                href={href("/admin/pantallas")}
              >
                {screens.online} / {screens.total} en línea
              </Link>
            </div>
            {screens.items.length === 0 ? (
              <p className="mt-2 text-meta text-muted-foreground">Ninguna pantalla se conectó.</p>
            ) : (
              <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-meta">
                {screens.items.slice(0, 8).map((screen) => (
                  <li
                    key={screen.id}
                    className={cn("flex min-w-0 items-center gap-2", !screen.online && "text-muted-foreground")}
                  >
                    <StatusDot tone={screen.online ? "ok" : "idle"} />
                    <span className="truncate">{screen.name || screenLabel(screen.path)}</span>
                    {!screen.online && now ? (
                      <span className="shrink-0 text-live-foreground">
                        · {formatRelative(new Date(screen.lastSeenAt).getTime() - now).replace("hace ", "")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
