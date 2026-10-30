"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Circle,
  CircleCheck,
  EllipsisVertical,
  MapPinCheck,
  OctagonX,
  Play,
  RotateCcw,
  ScanQrCode,
  Siren,
  UserMinus,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { scopedAdminHref } from "components/Admin/shell/use-selected-event";
import {
  eventClock,
  firstName,
  formatDayLabel,
  isMine,
  type StaffAnnouncement,
  type StaffArrival,
  type StaffTask,
  type StaffTaskStatus,
} from "components/Admin/tareas/helpers";
import { StatusActions, taskSwipes } from "components/Admin/tareas/TaskCard";
import {
  useAck,
  useMembership,
  useMyArrival,
  useSetStatus,
  useStaffLive,
  type Me,
} from "components/Admin/tareas/use-staff";
import { MicroLabel } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { SwipeRow } from "components/Admin/ui/swipe";
import { useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { orpc } from "lib/orpc";
import { minuteOfDay, taskPhase } from "lib/orpc/staff-tasks/shift";
import { wallClock } from "lib/slot-day";

/** Eventbrite's own door app: check-ins scanned there reach Asistentes through the mirror. */
const ORGANIZER_URL = "https://www.eventbrite.com/organizer/";

const names = (list: string[]) =>
  list.length > 1 ? `${list.slice(0, -1).join(", ")} y ${list.at(-1)}` : (list[0] ?? "");

/** What I can do with one of my tasks: the same steps a swipe takes, and leaving it. */
function MyTaskMenu({
  task,
  started,
  onSetStatus,
  onLeave,
}: {
  task: StaffTask;
  /** Its day has come: there is something to start or finish. */
  started: boolean;
  onSetStatus: (status: StaffTaskStatus) => void;
  onLeave: () => void;
}) {
  const steps: { label: string; icon: typeof Play; status: StaffTaskStatus }[] = !started
    ? []
    : task.status === "pending"
      ? [
          { label: "Empezar", icon: Play, status: "in_progress" },
          { label: "Terminar", icon: Check, status: "done" },
        ]
      : task.status === "in_progress"
        ? [
            { label: "Terminar", icon: Check, status: "done" },
            { label: "Bloqueada", icon: OctagonX, status: "blocked" },
          ]
        : task.status === "blocked"
          ? [
              { label: "Retomar", icon: RotateCcw, status: "in_progress" },
              { label: "Terminar", icon: Check, status: "done" },
            ]
          : [{ label: "Reabrir", icon: RotateCcw, status: "pending" }];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Más acciones para ${task.title}`}
          className="-mt-2 -mr-2 size-11 rounded-full"
          size="icon"
          variant="ghost"
        >
          <EllipsisVertical className="size-5! text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {steps.map((step) => (
          <DropdownMenuItem key={step.status} onSelect={() => onSetStatus(step.status)}>
            <step.icon />
            {step.label}
          </DropdownMenuItem>
        ))}
        {steps.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={onLeave}>
          <UserMinus />
          Bajarme
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function MiTurnoClient({
  eventId,
  eventName,
  eventSlug,
  communitySlug,
  timeZone,
  serverNow,
  me,
  initialTasks,
  initialAnnouncements,
  initialArrivals,
}: {
  eventId: string;
  eventName: string;
  eventSlug: string;
  communitySlug: string;
  timeZone: string;
  /** The server's clock while rendering, so the first paint matches it. */
  serverNow: number;
  me: Me;
  initialTasks: StaffTask[];
  initialAnnouncements: StaffAnnouncement[];
  initialArrivals: StaffArrival[];
}) {
  const input = { eventId };
  useStaffLive(eventId);
  const { data: tasks } = useQuery(
    orpc.staffTasks.list.queryOptions({ input, initialData: initialTasks, staleTime: 30_000 })
  );
  const { data: announcements } = useQuery(
    orpc.staffTasks.announcements.list.queryOptions({ input, initialData: initialAnnouncements, staleTime: 30_000 })
  );
  const { data: arrivals } = useQuery(
    orpc.staffTasks.arrivals.list.queryOptions({ input, initialData: initialArrivals, staleTime: 30_000 })
  );
  const setStatus = useSetStatus(eventId);
  const membership = useMembership(eventId, me);
  const ack = useAck(eventId, me);
  const shift = useMyArrival(eventId, me);

  const now = useNow(10_000);
  const clock = eventClock(now || serverNow, timeZone);
  const at24 = (iso: string) => wallClock(new Date(iso), timeZone).slice(11);

  const mine = tasks.filter((task) => task.type !== "milestone" && isMine(task, me.id));
  const eventDays = [...new Set(tasks.map((task) => task.dayDate))].sort();
  const isEventDay = eventDays.includes(clock.today);
  // Today on an event day; before it, the next day with something of mine.
  const day = isEventDay
    ? clock.today
    : (mine.find((task) => task.dayDate >= clock.today)?.dayDate ??
      eventDays.find((candidate) => candidate >= clock.today) ??
      clock.today);
  const at = minuteOfDay(day, clock.today, clock.nowMin);
  const myDay = mine.filter((task) => task.dayDate === day);
  const done = myDay.filter((task) => task.status === "done").length;
  const current =
    myDay.find((task) => ["now", "blocked", "overdue", "ongoing"].includes(taskPhase(task, at))) ??
    myDay.find((task) => taskPhase(task, at) === "upcoming");

  const myArrival = arrivals.find((arrival) => arrival.userId === me.id);
  const here = Boolean(myArrival && !myArrival.leftAt);
  const waiting = announcements.filter((item) => item.pending.some((person) => person.userId === me.id));
  const urgent = waiting.find((item) => item.urgent);
  const unread = waiting.filter((item) => item !== urgent);
  const reportHref = `${scopedAdminHref(communitySlug, "/admin/incidentes", eventSlug)}&nuevo=1`;

  return (
    <div className="mx-auto w-full max-w-[480px] space-y-4 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <PersonAvatar image={me.image} name={me.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-meta text-muted-foreground">Hola, {firstName(me.name)}</p>
          <h1 className="truncate text-[17px] leading-6 font-semibold text-foreground">{eventName}</h1>
        </div>
        <div className="text-right">
          <p className="font-terminal text-[20px] leading-6 text-foreground tabular-nums" suppressHydrationWarning>
            {clock.time}
          </p>
          <p className="text-meta text-muted-foreground">{formatDayLabel(clock.today)}</p>
        </div>
      </header>

      {urgent ? (
        <section
          aria-label="Aviso urgente"
          className="rounded-2xl border border-live/40 bg-live-surface p-4"
          role="alert"
        >
          <p className="flex items-center gap-2 font-terminal text-2xs tracking-[0.14em] text-live-foreground uppercase">
            <StatusDot pulse ring tone="live" />
            Urgente · {urgent.author ? firstName(urgent.author.name) : "Staff"} · {at24(urgent.createdAt)}
          </p>
          <p className="mt-2 text-[15px] leading-snug whitespace-pre-line text-foreground">{urgent.body}</p>
          <Button
            className="mt-3 w-full bg-foreground text-background hover:bg-foreground/90"
            disabled={ack.isPending}
            size="touch"
            onClick={() => ack.mutate({ eventId, announcementId: urgent.id })}
          >
            <Check />
            Recibido
          </Button>
        </section>
      ) : null}

      {isEventDay ? (
        here && myArrival ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-surface/60 py-2 pr-2 pl-4">
            <CircleCheck aria-hidden className="size-5 shrink-0 text-success-foreground" />
            <p className="flex-1 text-ui text-foreground">
              Llegaste <span className="font-terminal tabular-nums">{at24(myArrival.arrivedAt)}</span>
            </p>
            <Button
              disabled={shift.leave.isPending}
              size="touch"
              variant="ghost"
              onClick={() => shift.leave.mutate({ eventId })}
            >
              Salir del turno
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              className="h-14 w-full text-[17px]"
              disabled={shift.arrive.isPending}
              size="touch"
              onClick={() => shift.arrive.mutate({ eventId })}
            >
              <MapPinCheck />
              {myArrival?.leftAt ? "Volví" : "Llegué"}
            </Button>
            <p className="text-center text-meta text-muted-foreground">
              {myArrival?.leftAt ? `Saliste a las ${at24(myArrival.leftAt)}. ` : ""}
              Avisale al equipo que ya estás en el lugar.
            </p>
          </div>
        )
      ) : day > clock.today && myDay.length > 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-ui text-subtle">
          Tu turno es el <span className="text-foreground">{formatDayLabel(day)}</span>. Ese día, cuando llegues, marcá
          «Llegué» acá.
        </p>
      ) : null}

      {myDay.length > 0 ? (
        <section aria-label="Mis tareas">
          <div className="flex items-center justify-between px-1">
            <MicroLabel>{day === clock.today ? "Hoy" : formatDayLabel(day)}</MicroLabel>
            <span className="font-terminal text-2xs text-muted-foreground tabular-nums">
              {done} de {myDay.length} {myDay.length === 1 ? "hecha" : "hechas"}
            </span>
          </div>
          <ul className="mt-2 space-y-2">
            {myDay.map((task) => {
              const isDone = task.status === "done";
              const highlighted = task.id === current?.id && !isDone;
              const phase = taskPhase(task, at);
              const others = task.assignees
                .filter((person) => person.userId !== me.id && !person.noShow)
                .map((person) => firstName(person.name));
              const details = [
                task.location,
                highlighted && task.endTime ? `hasta ${task.endTime}` : null,
                others.length > 0 ? `con ${names(others)}` : null,
              ].filter(Boolean);
              const onSetStatus = (taskId: string, status: StaffTaskStatus) =>
                setStatus.mutate({ eventId, taskId, status });
              const swipes = taskSwipes(task, true, at, {
                onSetStatus,
                onJoin: (taskId) => membership.join.mutate({ eventId, taskId }),
                onLeave: (taskId) => membership.leave.mutate({ eventId, taskId }),
              });
              return (
                <li key={task.id}>
                  <SwipeRow className="rounded-[14px]" left={swipes.left} right={swipes.right}>
                    <div
                      className={cn(
                        "rounded-[14px] border p-3.5",
                        highlighted ? "border-primary/40 bg-primary-surface/60" : "border-border bg-card"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "w-12 shrink-0 pt-0.5 font-terminal text-meta tabular-nums",
                            isDone ? "text-muted-foreground" : "text-foreground"
                          )}
                        >
                          {task.startTime ?? "—"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-[15px] leading-snug font-medium text-foreground",
                              isDone && "text-muted-foreground line-through"
                            )}
                          >
                            {task.title}
                          </p>
                          {details.length > 0 ? (
                            <p className="mt-0.5 text-meta text-muted-foreground">{details.join(" · ")}</p>
                          ) : null}
                        </div>
                        {highlighted ? (
                          <Badge
                            className="mt-0.5"
                            variant={phase === "overdue" || phase === "blocked" ? "destructive" : "default"}
                          >
                            {phase === "upcoming"
                              ? "siguiente"
                              : phase === "overdue"
                                ? "atrasada"
                                : phase === "blocked"
                                  ? "bloqueada"
                                  : "ahora"}
                          </Badge>
                        ) : at < 0 ? null : (
                          <Button
                            aria-label={isDone ? `Reabrir ${task.title}` : `Marcar ${task.title} como hecha`}
                            className="-mt-2 -mr-2 size-11 rounded-full"
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setStatus.mutate({ eventId, taskId: task.id, status: isDone ? "pending" : "done" })
                            }
                          >
                            {isDone ? (
                              <CircleCheck className="size-5! text-success-foreground" />
                            ) : (
                              <Circle className="size-5! text-muted-foreground" />
                            )}
                          </Button>
                        )}
                        <MyTaskMenu
                          started={at >= 0}
                          task={task}
                          onLeave={() => swipes.left?.run()}
                          onSetStatus={(status) => onSetStatus(task.id, status)}
                        />
                      </div>
                      {highlighted && at >= 0 ? (
                        <StatusActions
                          className="mt-3 [&>button]:flex-1"
                          size="touch"
                          task={task}
                          onSetStatus={(taskId, status) => setStatus.mutate({ eventId, taskId, status })}
                        />
                      ) : null}
                      {highlighted && task.notes ? (
                        <p className="mt-3 border-t border-primary/15 pt-3 text-meta leading-relaxed whitespace-pre-line text-subtle">
                          {task.notes}
                        </p>
                      ) : null}
                    </div>
                  </SwipeRow>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <EmptyState
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={scopedAdminHref(communitySlug, "/admin/tareas", eventSlug)}>Ver el cronograma</Link>
            </Button>
          }
          description="Cuando te sumen a una tarea, aparece acá con su hora y su lugar."
          owy
          title={isEventDay ? "Hoy no tenés tareas" : "Todavía no tenés tareas"}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button asChild className="h-12 px-3 text-[14px]" size="touch" variant="outline">
          <Link href={reportHref}>
            <Siren className="text-live-foreground" />
            Reportar
          </Link>
        </Button>
        <Button asChild className="h-12 px-3 text-[14px]" size="touch" variant={here ? "default" : "outline"}>
          <a href={ORGANIZER_URL} rel="noreferrer" target="_blank">
            <ScanQrCode />
            Escanear entradas
          </a>
        </Button>
      </div>
      <p className="px-1 text-meta text-muted-foreground">
        «Escanear entradas» abre Eventbrite Organizer: escaneá con esa app y el check-in llega solo a Asistentes.
      </p>

      {unread.length > 0 ? (
        <section aria-label="Avisos sin leer" className="space-y-2">
          <MicroLabel className="px-1">Avisos sin leer</MicroLabel>
          {unread.map((item) => (
            <article key={item.id} className="rounded-[14px] border border-border bg-card p-3.5">
              <p className="font-terminal text-2xs text-muted-foreground tabular-nums">
                {item.author ? firstName(item.author.name) : "Staff"} · {at24(item.createdAt)}
              </p>
              <p className="mt-1 text-ui leading-snug whitespace-pre-line text-foreground">{item.body}</p>
              <Button
                className="mt-2.5 w-full"
                disabled={ack.isPending}
                size="touch"
                variant="outline"
                onClick={() => ack.mutate({ eventId, announcementId: item.id })}
              >
                <Check />
                Recibido
              </Button>
            </article>
          ))}
        </section>
      ) : null}

      <p className="pt-2 text-center">
        <Link
          className="text-meta text-muted-foreground underline-offset-4 hover:text-foreground hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
          href={scopedAdminHref(communitySlug, "/admin/tareas", eventSlug)}
        >
          Ver el cronograma de todo el staff
        </Link>
      </p>
    </div>
  );
}
