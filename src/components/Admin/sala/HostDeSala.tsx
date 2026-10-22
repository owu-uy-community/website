"use client";

import * as React from "react";
import Link from "next/link";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleCheck, DoorOpen, Hand, Siren, TriangleAlert, Users, type LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { firstName, isLoud, SeverityDot, StatusBadge } from "components/Admin/incidents/meta";
import { ReportIncidentPanel } from "components/Admin/incidents/ReportIncident";
import { scopedAdminHref } from "components/Admin/shell/use-selected-event";
import { useShell } from "components/Admin/shell/use-shell-status";
import { MicroLabel, Meter, PageContainer } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { formatClock, useNow } from "components/Admin/ui/time";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/shared/ui/alert-dialog";
import { Button } from "components/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc, type Room } from "lib/orpc";
import type { RoomStatus } from "lib/orpc/rooms/schemas";
import { eventChannel } from "lib/realtime/channels";
import { roomColorFor } from "lib/rooms/palette";
import { roomNow } from "./now";

const STATUS_OPTIONS: { value: RoomStatus; label: string; icon: LucideIcon; on: string; tint: string }[] = [
  {
    value: "open",
    label: "Abierta",
    icon: CircleCheck,
    on: "border-success/50 bg-success-surface text-success-foreground shadow-[0_0_0_3px_hsl(var(--success)/0.12)]",
    tint: "text-success-foreground",
  },
  {
    value: "full",
    label: "Llena",
    icon: Users,
    on: "border-warning/60 bg-warning-surface text-warning-foreground shadow-[0_0_0_3px_hsl(var(--warning)/0.12)]",
    tint: "text-warning-foreground",
  },
  {
    value: "evacuate",
    label: "Evacuar",
    icon: TriangleAlert,
    on: "border-live/60 bg-live-surface text-live-foreground shadow-[0_0_0_3px_hsl(var(--live)/0.14)]",
    tint: "text-live-foreground",
  },
];

const HOST_TASK = /^host de sala/i;
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
/** "Host de sala · Cueva" (or a host task whose place is the room) belongs to Cueva. */
const hostsRoom = (task: { title: string; location: string | null }, room: Room) =>
  HOST_TASK.test(task.title) &&
  [task.title.split("·")[1], task.location].some((name) => name && plain(name) === plain(room.name));

/** "15:42" (or "1:05:00") left, never negative. */
function countdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** The room this phone hosts: remembered per device and event, in localStorage. */
const storageKey = (eventId: string) => `owu-admin:sala:${eventId}`;
// The storage event only reaches other tabs; this tab's readers hear it from here. (A fake
// storage event would also reach other code listening to it, and some of it acts on it.)
const sameTab = new Set<() => void>();
const subscribeStorage = (listener: () => void) => {
  sameTab.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    sameTab.delete(listener);
    window.removeEventListener("storage", listener);
  };
};
function useRememberedRoom(eventId: string) {
  const key = storageKey(eventId);
  const remembered = React.useSyncExternalStore(
    subscribeStorage,
    () => window.localStorage.getItem(key),
    () => null
  );
  const remember = (roomId: string) => {
    window.localStorage.setItem(key, roomId);
    for (const listener of sameTab) listener();
  };

  return [remembered, remember] as const;
}

function ConfirmAction({
  open,
  onOpenChange,
  title,
  description,
  label,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="max-sm:h-11">Cancelar</AlertDialogCancel>
          <AlertDialogAction className="max-sm:h-11" variant={danger ? "destructive" : "default"} onClick={onConfirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Host de sala: one room, from the host's phone. Its status (shown on kiosks, the agenda and
 * Owy), the talk on now with the time it has left, what's next, the room's open incident, and
 * the two calls a host makes: report something, or ask the staff for a hand.
 */
export function HostDeSala({ eventId, meId }: { eventId: string; meId: string }) {
  const queryClient = useQueryClient();
  const { status, selected } = useShell();
  const timezone = status?.event.timezone;
  const now = useNow(1000);
  const [remembered, remember] = useRememberedRoom(eventId);
  const [confirm, setConfirm] = React.useState<"evacuate" | "help" | null>(null);
  const [reporting, setReporting] = React.useState(false);

  const roomsKey = orpc.rooms.getByOpenSpace.queryKey({ input: { openSpaceId: eventId } });
  const roomsQuery = useQuery(orpc.rooms.getByOpenSpace.queryOptions({ input: { openSpaceId: eventId } }));
  const slotsQuery = useQuery(orpc.schedules.getByOpenSpace.queryOptions({ input: { openSpaceId: eventId } }));
  const talksQuery = useQuery(orpc.tracks.getByOpenSpace.queryOptions({ input: { openSpaceId: eventId } }));
  const tasksQuery = useQuery(orpc.staffTasks.list.queryOptions({ input: { eventId }, staleTime: 60_000 }));
  const incidentsQuery = useQuery(orpc.incidents.list.queryOptions({ input: { eventId }, staleTime: 15_000 }));

  useRealtimeChannel(eventChannel(eventId, "ops"), (topic) => {
    if (topic === "rooms") void queryClient.invalidateQueries({ queryKey: orpc.rooms.getByOpenSpace.key() });
    if (topic === "incidents") void queryClient.invalidateQueries({ queryKey: orpc.incidents.list.key() });
  });
  useRealtimeChannel(eventChannel(eventId, "sync"), (event) => {
    if (event === "structure_change") {
      void queryClient.invalidateQueries({ queryKey: orpc.rooms.getByOpenSpace.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
    }
    if (event === "structure_change" || event === "card_change") {
      void queryClient.invalidateQueries({ queryKey: orpc.tracks.getByOpenSpace.key() });
    }
  });

  const setStatus = useMutation(
    orpc.rooms.setStatus.mutationOptions({
      onMutate: async ({ roomId, status: next }) => {
        await queryClient.cancelQueries({ queryKey: roomsKey });
        const previous = queryClient.getQueryData<Room[]>(roomsKey);
        queryClient.setQueryData<Room[]>(roomsKey, (old = []) =>
          old.map((item) =>
            item.id === roomId ? { ...item, status: next, statusUpdatedAt: new Date().toISOString() } : item
          )
        );
        return { previous };
      },
      onError: (error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(roomsKey, context.previous);
        toast.error("No se pudo cambiar el estado", error.message);
      },
      onSuccess: (room) =>
        toast.success(
          room.status === "evacuate"
            ? `Evacuar ${room.name}`
            : `${room.name}: ${STATUS_OPTIONS.find((item) => item.value === room.status)?.label.toLowerCase()}`,
          room.status === "evacuate" ? "Le avisamos urgente a todo el staff." : "Ya se ve en kioscos, agenda y Owy."
        ),
    })
  );
  const requestStaff = useMutation(
    orpc.incidents.requestStaff.mutationOptions({
      onSuccess: () => toast.success("Pedido enviado", "Le avisamos a todo el staff."),
      onError: (error) => toast.error("No se pudo pedir staff", error.message),
    })
  );

  const rooms = (roomsQuery.data ?? []).filter((item) => item.isActive);
  const tasks = tasksQuery.data ?? [];
  const mine = rooms.find((item) =>
    tasks.some((task) => hostsRoom(task, item) && task.assignees.some((person) => person.userId === meId))
  );
  const room = rooms.find((item) => item.id === remembered) ?? mine ?? rooms[0];

  if (roomsQuery.isError) {
    return (
      <PageContainer className="max-w-[480px]" size="small">
        <ErrorState retrying={roomsQuery.isFetching} onRetry={() => void roomsQuery.refetch()} />
      </PageContainer>
    );
  }
  if (roomsQuery.isPending || !status) {
    return (
      <PageContainer className="max-w-[480px] space-y-3" size="small">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </PageContainer>
    );
  }
  if (!room) {
    return (
      <PageContainer className="max-w-[480px]" size="small">
        <EmptyState
          description="Cuando el evento tenga salas, acá elegís la tuya."
          icon={DoorOpen}
          title="Este evento todavía no tiene salas"
        />
      </PageContainer>
    );
  }

  const color = roomColorFor(room.id, room.color);
  const hosts = tasks.filter((task) => hostsRoom(task, room)).flatMap((task) => task.assignees);

  // On the event's wall clock, to the second; nothing is "on" until the clock is known.
  const schedule =
    now && timezone ? roomNow(slotsQuery.data ?? [], talksQuery.data ?? [], room.id, now, timezone) : null;
  const current = schedule?.current?.slot;
  const currentTalk = schedule?.current?.talk;
  const leftMs = schedule?.current?.leftMs ?? 0;
  const lengthMs = schedule?.current?.lengthMs ?? 1;
  const nextWithTalk = schedule?.next?.slot;
  const nextTalk = schedule?.next?.talk;
  const today = schedule?.today;
  // "hoy", or "sáb 7 nov" (the date-only day, read at noon UTC so no zone moves it).
  const dayLabel = (day: string) =>
    day === today
      ? "hoy"
      : new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
          .formatToParts(new Date(`${day}T12:00:00Z`))
          .filter((part) => part.type !== "literal")
          .map((part) => part.value.replace(".", ""))
          .join(" ");

  const roomIncidents = (incidentsQuery.data ?? []).filter(
    (incident) => incident.room?.id === room.id && incident.status !== "resolved"
  );
  const incident = roomIncidents[0];
  const incidentsHref = selected
    ? scopedAdminHref(selected.communitySlug, "/admin/incidentes", selected.slug)
    : "/admin/incidentes";

  const changeStatus = (next: RoomStatus) => {
    if (next === room.status) return;
    if (next === "evacuate") setConfirm("evacuate");
    else setStatus.mutate({ roomId: room.id, status: next });
  };

  return (
    <PageContainer className="max-w-[480px] space-y-3" size="small">
      <div className="flex items-center gap-3 px-1 pb-1">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}66` }}
        >
          <DoorOpen aria-hidden className="size-5" style={{ color }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-meta text-muted-foreground">
            {hosts.length > 0
              ? `Host · ${hosts.map((person) => (person.userId === meId ? "vos" : firstName(person.name))).join(", ")}`
              : "Sin host asignado"}
          </p>
          <Select value={room.id} onValueChange={remember}>
            <SelectTrigger
              aria-label="Elegí tu sala"
              className="h-7 w-auto max-w-full justify-start gap-1.5 border-0 bg-transparent px-0 font-display text-[17px] font-semibold shadow-none hover:border-0 focus-visible:ring-offset-0 pointer-coarse:h-11"
            >
              <SelectValue>{room.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {rooms.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: roomColorFor(item.id, item.color) }}
                    />
                    {item.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-3 shadow-edge">
        <MicroLabel className="px-1">Estado de la sala</MicroLabel>
        <ToggleGroup.Root
          aria-label="Estado de la sala"
          className="mt-2.5 grid grid-cols-3 gap-2"
          disabled={setStatus.isPending}
          type="single"
          value={room.status}
          onValueChange={(value) => value && changeStatus(value as RoomStatus)}
        >
          {STATUS_OPTIONS.map((option) => {
            const on = room.status === option.value;
            return (
              <ToggleGroup.Item
                key={option.value}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl border text-ui transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
                  on
                    ? cn("font-semibold", option.on)
                    : "border-input bg-background font-medium text-subtle hover:bg-raised"
                )}
                value={option.value}
              >
                <option.icon aria-hidden className={cn("size-[18px]", option.tint)} />
                {option.label}
              </ToggleGroup.Item>
            );
          })}
        </ToggleGroup.Root>
        <p className="mt-2.5 px-1 text-meta text-muted-foreground">
          Se ve en kioscos, agenda y Owy
          {room.statusUpdatedAt ? (
            <>
              {" · cambiado "}
              <span className="font-terminal tabular-nums">
                {formatClock(new Date(room.statusUpdatedAt), timezone)}
              </span>
            </>
          ) : null}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-edge">
        {current ? (
          <>
            <div className="flex items-center gap-2">
              <StatusDot ring tone="live" />
              <span className="font-terminal text-2xs tracking-[0.14em] text-live-foreground uppercase">
                Ahora · {current.name}
              </span>
              <span className="ml-auto font-terminal text-meta text-foreground tabular-nums">
                quedan {countdown(leftMs)}
              </span>
            </div>
            {currentTalk ? (
              <>
                <p className="mt-2 text-[16px] leading-snug font-semibold text-foreground">{currentTalk.title}</p>
                <p className="mt-0.5 text-meta text-muted-foreground">
                  {[
                    currentTalk.speaker,
                    currentTalk.needsTV ? (room.hasTV ? "necesita TV ✓" : "necesita TV · esta sala no tiene") : null,
                    currentTalk.needsWhiteboard
                      ? room.hasWhiteboard
                        ? "necesita pizarra ✓"
                        : "necesita pizarra · esta sala no tiene"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            ) : (
              <p className="mt-2 text-ui text-muted-foreground">Sala libre en este bloque.</p>
            )}
            <Meter className="mt-3" max={lengthMs} tone="live" value={lengthMs - leftMs} />
          </>
        ) : (
          <div className="flex items-center gap-2">
            <StatusDot tone="idle" />
            <span className="font-terminal text-2xs tracking-[0.14em] text-muted-foreground uppercase">
              {nextWithTalk
                ? `Próxima · ${dayLabel(nextWithTalk.day)} · ${nextWithTalk.startTime}`
                : "Sin charlas por delante"}
            </span>
          </div>
        )}
        {nextTalk && nextWithTalk ? (
          <div
            className={cn("flex items-center gap-2 text-meta", current ? "mt-3 border-t border-border pt-3" : "mt-2")}
          >
            {current ? (
              <span className="font-terminal text-muted-foreground tabular-nums">{nextWithTalk.startTime}</span>
            ) : null}
            <span
              className={cn(
                "truncate",
                current ? "text-subtle" : "text-[16px] leading-snug font-semibold text-foreground"
              )}
            >
              {nextTalk.title}
            </span>
          </div>
        ) : null}
        {!current && nextTalk?.speaker ? (
          <p className="mt-0.5 text-meta text-muted-foreground">{nextTalk.speaker}</p>
        ) : null}
      </section>

      {incident ? (
        <Link
          className={cn(
            "block rounded-[14px] border p-3.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
            // Loud only when it is: a lost jacket stays calm.
            isLoud(incident.severity)
              ? "border-live/30 bg-live-surface/60 hover:bg-live-surface"
              : incident.severity === "medium"
                ? "border-warning/25 bg-warning-surface/50 hover:bg-warning-surface"
                : "border-border bg-card hover:bg-raised"
          )}
          href={`${incidentsHref}${incidentsHref.includes("?") ? "&" : "?"}incidente=${incident.id}`}
        >
          <span className="flex items-center gap-2">
            <SeverityDot incident={incident} />
            <span className="line-clamp-2 min-w-0 flex-1 text-[14px] font-medium text-foreground">
              {incident.title}
            </span>
            {incident.status === "in_progress" && incident.assignee ? (
              <span className="inline-flex h-5 shrink-0 items-center rounded-sm border border-info/40 bg-info-surface px-1.5 text-2xs font-medium text-info-foreground">
                en camino
              </span>
            ) : (
              <StatusBadge status={incident.status} />
            )}
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </span>
          <span className="mt-1 flex items-center gap-2 text-meta text-muted-foreground">
            {incident.assignee ? (
              <PersonAvatar image={incident.assignee.image} name={incident.assignee.name} size={16} />
            ) : null}
            {incident.assignee ? firstName(incident.assignee.name) : "Sin asignar"} · reportado{" "}
            <span className="font-terminal tabular-nums">{formatClock(new Date(incident.createdAt), timezone)}</span>
            {roomIncidents.length > 1 ? ` · y ${roomIncidents.length - 1} más` : ""}
          </span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button className="rounded-xl" size="touch" variant="destructive" onClick={() => setReporting(true)}>
          <Siren />
          Reportar
        </Button>
        <Button
          className="rounded-xl"
          disabled={requestStaff.isPending}
          size="touch"
          variant="outline"
          onClick={() => setConfirm("help")}
        >
          <Hand className="text-primary!" />
          Pedir staff
        </Button>
      </div>

      <ConfirmAction
        danger
        description="Le avisamos urgente a todo el staff, y kioscos, agenda y Owy la muestran para evacuar."
        label="Evacuar"
        open={confirm === "evacuate"}
        title={`¿Evacuar ${room.name}?`}
        onConfirm={() => setStatus.mutate({ roomId: room.id, status: "evacuate" })}
        onOpenChange={(open) => !open && setConfirm(null)}
      />
      <ConfirmAction
        description={`Le avisamos a todo el staff que se necesita ayuda en ${room.name}.`}
        label="Pedir staff"
        open={confirm === "help"}
        title={`¿Pedir ayuda en ${room.name}?`}
        onConfirm={() => requestStaff.mutate({ eventId, roomId: room.id })}
        onOpenChange={(open) => !open && setConfirm(null)}
      />
      <ReportIncidentPanel
        defaultRoomId={room.id}
        eventId={eventId}
        open={reporting}
        rooms={rooms}
        source="phone"
        onOpenChange={setReporting}
      />
    </PageContainer>
  );
}
