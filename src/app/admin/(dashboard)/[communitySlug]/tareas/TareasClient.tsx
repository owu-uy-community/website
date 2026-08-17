"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ClipboardList, Flag, Megaphone, Plus, UserRound } from "lucide-react";

import { cn } from "app/lib/utils";
import { RealtimeIndicator } from "components/Meetups/OpenSpace/atoms/RealtimeIndicator";
import { AnnouncementsPanel } from "components/Admin/tareas/AnnouncementsPanel";
import { ScheduleTable, ShiftPopover } from "components/Admin/tareas/ScheduleTable";
import { TaskCard } from "components/Admin/tareas/TaskCard";
import { TaskFormDialog, type TaskFormValues } from "components/Admin/tareas/TaskFormDialog";
import {
  DEFAULT_TASK_MINUTES,
  formatClock,
  formatDayLabel,
  isMine,
  taskWindow,
  todayDayString,
  type RosterMember,
  type StaffAnnouncement,
  type StaffTask,
  type StaffTaskStatus,
} from "components/Admin/tareas/helpers";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Empty } from "components/shared/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "components/shared/ui/toggle-group";
import { toast } from "components/shared/ui/toast-utils";
import { eventChannel } from "lib/realtime/channels";
import { orpc } from "lib/orpc";
import type { CommunityMember } from "lib/orpc/communities/schemas";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";

/** Live clock, ticking twice a minute. */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

interface TareasClientProps {
  eventId: string;
  eventName: string;
  meId: string;
  meName: string;
  canEdit: boolean;
  initialTasks: StaffTask[];
  initialAnnouncements: StaffAnnouncement[];
  initialRoster: CommunityMember[];
}

export default function TareasClient({
  eventId,
  eventName,
  meId,
  meName,
  canEdit,
  initialTasks,
  initialAnnouncements,
  initialRoster,
}: TareasClientProps) {
  const queryClient = useQueryClient();
  const now = useNow();

  // ---------------------------------------------------------------- queries
  const tasksKey = orpc.staffTasks.list.queryKey({ input: { eventId } });
  const announcementsKey = orpc.staffTasks.announcements.list.queryKey({ input: { eventId } });

  const { data: tasks = [] } = useQuery(
    orpc.staffTasks.list.queryOptions({
      input: { eventId },
      initialData: initialTasks,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    })
  );

  const { data: announcements = [] } = useQuery(
    orpc.staffTasks.announcements.list.queryOptions({
      input: { eventId },
      initialData: initialAnnouncements,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    })
  );

  const { data: roster = [] } = useQuery(
    orpc.staffTasks.roster.queryOptions({
      input: { eventId },
      initialData: initialRoster,
      staleTime: 5 * 60_000,
    })
  );

  const invalidateTasks = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.staffTasks.list.key({ input: { eventId } }) }),
    [queryClient, eventId]
  );
  const invalidateAnnouncements = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.staffTasks.announcements.list.key({ input: { eventId } }) }),
    [queryClient, eventId]
  );

  // -------------------------------------------------------------- realtime
  // Content-free pings; the data itself always comes from guarded oRPC reads.
  const { isConnected } = useRealtimeChannel(eventChannel(eventId, "staff"), (event) => {
    if (event === "tasks_changed") {
      void invalidateTasks();
      void invalidateAnnouncements();
    } else if (event === "announcement_created") {
      void invalidateAnnouncements();
    }
  });

  // Toast + banner for announcements that arrive while the page is open.
  const seenAnnouncementsRef = useRef<Set<string>>(new Set(initialAnnouncements.map((a) => a.id)));
  useEffect(() => {
    for (const announcement of announcements) {
      if (seenAnnouncementsRef.current.has(announcement.id)) continue;
      seenAnnouncementsRef.current.add(announcement.id);
      if (announcement.author?.id === meId) continue;
      const from = announcement.author?.name ?? "Staff";
      if (announcement.urgent) {
        toast.warning(`Urgente — ${from}`, announcement.body.slice(0, 140));
      } else {
        toast.info(`Anuncio de ${from}`, announcement.body.slice(0, 140));
      }
    }
  }, [announcements, meId]);

  const urgentUnacked = useMemo(
    () => announcements.find((announcement) => announcement.urgent && !announcement.ackedByMe) ?? null,
    [announcements]
  );

  // ------------------------------------------------------------- mutations
  const setStatusMutation = useMutation(
    orpc.staffTasks.setStatus.mutationOptions({
      onMutate: ({ taskId, status }) => {
        void queryClient.cancelQueries({ queryKey: orpc.staffTasks.list.key({ input: { eventId } }) });
        const previous = queryClient.getQueryData<StaffTask[]>(tasksKey);
        queryClient.setQueryData<StaffTask[]>(tasksKey, (old = []) =>
          old.map((task) => (task.id === taskId ? { ...task, status: status as StaffTaskStatus } : task))
        );
        return { previous };
      },
      onError: (error, _variables, context) => {
        if (context?.previous) queryClient.setQueryData(tasksKey, context.previous);
        toast.error("No se pudo actualizar el estado", error instanceof Error ? error.message : "Error inesperado");
      },
    })
  );

  const membershipMutation = (kind: "join" | "leave") =>
    orpc.staffTasks[kind].mutationOptions({
      onMutate: ({ taskId }: { eventId: string; taskId: string }) => {
        void queryClient.cancelQueries({ queryKey: orpc.staffTasks.list.key({ input: { eventId } }) });
        const previous = queryClient.getQueryData<StaffTask[]>(tasksKey);
        queryClient.setQueryData<StaffTask[]>(tasksKey, (old = []) =>
          old.map((task) => {
            if (task.id !== taskId) return task;
            const without = task.assignees.filter((assignee) => assignee.userId !== meId);
            return {
              ...task,
              assignees: kind === "join" ? [...without, { userId: meId, name: meName, image: null }] : without,
            };
          })
        );
        return { previous };
      },
      onError: (error: unknown, _variables: unknown, context: { previous?: StaffTask[] } | undefined) => {
        if (context?.previous) queryClient.setQueryData(tasksKey, context.previous);
        toast.error("No se pudo actualizar la asignación", error instanceof Error ? error.message : "Error inesperado");
      },
    });

  const joinMutation = useMutation(membershipMutation("join"));
  const leaveMutation = useMutation(membershipMutation("leave"));

  const createMutation = useMutation(orpc.staffTasks.create.mutationOptions({}));
  const updateMutation = useMutation(orpc.staffTasks.update.mutationOptions({}));
  const deleteMutation = useMutation(
    orpc.staffTasks.delete.mutationOptions({
      onSuccess: (deleted) => {
        toast.success("Tarea eliminada", `"${deleted.title}" fue eliminada.`);
        void invalidateTasks();
      },
      onError: (error) =>
        toast.error("No se pudo eliminar", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  const shiftMutation = useMutation(
    orpc.staffTasks.shiftFrom.mutationOptions({
      onSuccess: ({ count }) => {
        toast.success(
          "Cronograma corrido",
          count > 0 ? `${count} tarea${count > 1 ? "s" : ""} actualizadas.` : "No había tareas para correr."
        );
        void invalidateTasks();
      },
      onError: (error) =>
        toast.error("No se pudo correr el cronograma", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  const announceMutation = useMutation(
    orpc.staffTasks.announcements.create.mutationOptions({
      onSuccess: () => void invalidateAnnouncements(),
      onError: (error) =>
        toast.error("No se pudo enviar el anuncio", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  const ackMutation = useMutation(
    orpc.staffTasks.announcements.ack.mutationOptions({
      onMutate: ({ announcementId }) => {
        const previous = queryClient.getQueryData<StaffAnnouncement[]>(announcementsKey);
        queryClient.setQueryData<StaffAnnouncement[]>(announcementsKey, (old = []) =>
          old.map((announcement) =>
            announcement.id === announcementId
              ? { ...announcement, ackedByMe: true, ackCount: announcement.ackCount + 1 }
              : announcement
          )
        );
        return { previous };
      },
      onError: (_error, _variables, context) => {
        if (context?.previous) queryClient.setQueryData(announcementsKey, context.previous);
      },
    })
  );

  // ------------------------------------------------------------- UI state
  const today = todayDayString();
  const days = useMemo(() => {
    const unique = Array.from(new Set(tasks.map((task) => task.dayDate))).sort();
    return unique.length > 0 ? unique : [today];
  }, [tasks, today]);

  const [dayState, setDayState] = useState<string | null>(null);
  const selectedDay =
    dayState && days.includes(dayState)
      ? dayState
      : days.includes(today)
        ? today
        : (days.find((day) => day >= today) ?? days[days.length - 1]);

  const [myOnly, setMyOnly] = useState(!canEdit);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<StaffTask | null>(null);

  const dayTasks = useMemo(() => tasks.filter((task) => task.dayDate === selectedDay), [tasks, selectedDay]);
  const visibleDayTasks = useMemo(
    () => (myOnly ? dayTasks.filter((task) => task.type === "milestone" || isMine(task, meId)) : dayTasks),
    [dayTasks, myOnly, meId]
  );

  // ------------------------------------------------------- "Ahora" derived
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const isViewingToday = selectedDay === today;

  const milestones = useMemo(() => dayTasks.filter((task) => task.type === "milestone"), [dayTasks]);
  const currentMilestone = useMemo(() => {
    if (!isViewingToday) return null;
    const past = milestones.filter((m) => m.startTime && (taskWindow(m)?.start ?? 0) <= nowMins);
    return past[past.length - 1] ?? null;
  }, [milestones, nowMins, isViewingToday]);

  const lanes = useMemo(() => {
    const work = visibleDayTasks.filter((task) => task.type === "task");
    const ongoing = visibleDayTasks.filter((task) => task.type === "ongoing" && task.status !== "done");

    const active: StaffTask[] = [];
    const upcoming: StaffTask[] = [];
    const overdueIds = new Set<string>();

    for (const task of work) {
      if (task.status === "done") continue;
      const window = taskWindow(task);
      if (!window) {
        upcoming.push(task);
        continue;
      }
      if (task.status === "in_progress" || (window.start <= nowMins && window.end > nowMins)) {
        active.push(task);
      } else if (window.end <= nowMins) {
        active.push(task);
        overdueIds.add(task.id);
      } else {
        upcoming.push(task);
      }
    }

    return { active, upcoming: upcoming.slice(0, 10), ongoing, overdueIds };
  }, [visibleDayTasks, nowMins]);

  const myNext = useMemo(() => {
    const mine = dayTasks
      .filter((task) => task.type !== "milestone" && task.status !== "done" && isMine(task, meId))
      .sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
    return mine.find((task) => {
      const window = taskWindow(task);
      return !window || window.end > nowMins || task.status === "in_progress";
    });
  }, [dayTasks, meId, nowMins]);

  // ------------------------------------------------------------- handlers
  const handleSetStatus = useCallback(
    (taskId: string, status: StaffTaskStatus) => setStatusMutation.mutate({ eventId, taskId, status }),
    [setStatusMutation, eventId]
  );
  const handleJoin = useCallback((taskId: string) => joinMutation.mutate({ eventId, taskId }), [joinMutation, eventId]);
  const handleLeave = useCallback(
    (taskId: string) => leaveMutation.mutate({ eventId, taskId }),
    [leaveMutation, eventId]
  );

  const handleSaveTask = async (values: TaskFormValues) => {
    try {
      if (editingTask) {
        await updateMutation.mutateAsync({ eventId, taskId: editingTask.id, data: values });
        toast.success("Tarea actualizada", `"${values.title}" fue guardada.`);
      } else {
        await createMutation.mutateAsync({
          eventId,
          title: values.title,
          type: values.type,
          dayDate: values.dayDate,
          startTime: values.startTime,
          endTime: values.endTime,
          minPeople: values.minPeople,
          location: values.location,
          notes: values.notes ?? undefined,
          assigneeIds: values.assigneeIds,
        });
        toast.success("Tarea creada", `"${values.title}" ya está en el cronograma.`);
      }
      setFormOpen(false);
      setEditingTask(null);
      void invalidateTasks();
    } catch (error) {
      toast.error("No se pudo guardar la tarea", error instanceof Error ? error.message : "Error inesperado");
    }
  };

  const handleShift = async (fromTime: string, deltaMinutes: number) => {
    await shiftMutation.mutateAsync({ eventId, dayDate: selectedDay, fromTime, deltaMinutes });
  };

  const handleSend = async (values: { body: string; urgent: boolean; taskId: string | null }) => {
    await announceMutation.mutateAsync({
      eventId,
      body: values.body,
      urgent: values.urgent,
      audience: values.taskId ? "task" : "all",
      taskId: values.taskId ?? undefined,
    });
  };

  const handleAck = useCallback(
    (announcementId: string) => ackMutation.mutate({ eventId, announcementId }),
    [ackMutation, eventId]
  );

  const announcementsPanel = (
    <AnnouncementsPanel
      announcements={announcements}
      canEdit={canEdit}
      isSending={announceMutation.isPending}
      tasks={dayTasks}
      onAck={handleAck}
      onSend={handleSend}
    />
  );

  // ---------------------------------------------------------------- render
  return (
    <div className="space-y-3 p-3 md:space-y-4 md:p-6">
      {/* Header — one compact row on phones */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground md:text-2xl">Tareas</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground md:text-sm">
            {eventName}
            <span className="hidden md:inline"> — coordinación del staff en tiempo real</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-terminal text-sm font-semibold tabular-nums text-foreground">{formatClock(now)}</span>
          <RealtimeIndicator isConnected={isConnected} />
        </div>
      </div>

      {/* Urgent banner: persists until acknowledged */}
      {urgentUnacked && (
        <div className="rounded-lg border border-primary/60 bg-primary/[0.08] px-3 py-2.5 sm:flex sm:items-center sm:gap-3 sm:px-4">
          <div className="flex items-start gap-2 sm:flex-1">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{urgentUnacked.body}</p>
              <p className="text-xs text-muted-foreground">{urgentUnacked.author?.name ?? "Staff"}</p>
            </div>
          </div>
          <Button
            className="mt-2.5 h-11 w-full shrink-0 sm:mt-0 sm:h-9 sm:w-auto"
            size="sm"
            onClick={() => handleAck(urgentUnacked.id)}
          >
            <Check />
            Recibido
          </Button>
        </div>
      )}

      {/* Day picker — scrolls sideways when an event spans several days */}
      {days.length > 1 && (
        <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
          <ToggleGroup
            className="w-max justify-start"
            type="single"
            value={selectedDay}
            onValueChange={(value) => value && setDayState(value)}
          >
            {days.map((day) => (
              <ToggleGroupItem key={day} className="h-11 gap-1.5 capitalize md:h-9" value={day}>
                {formatDayLabel(day)}
                {day === today && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      {/* Actions — 44px targets on phones */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-pressed={myOnly}
          className="h-11 md:h-9"
          size="sm"
          variant={myOnly ? "secondary" : "outline"}
          onClick={() => setMyOnly((value) => !value)}
        >
          <UserRound />
          {myOnly ? "Solo mis tareas" : "Todas"}
        </Button>
        {canEdit && (
          <>
            <ShiftPopover isShifting={shiftMutation.isPending} onShift={handleShift} />
            <Button
              className="ml-auto h-11 md:h-9"
              size="sm"
              onClick={() => {
                setEditingTask(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              Tarea
            </Button>
          </>
        )}
      </div>

      <Tabs defaultValue="ahora">
        <TabsList className="sticky top-14 z-20 h-11 w-full justify-start md:static md:h-10 md:w-auto">
          <TabsTrigger className="h-9 flex-1 md:flex-none" value="ahora">
            Ahora
          </TabsTrigger>
          <TabsTrigger className="h-9 flex-1 md:flex-none" value="cronograma">
            Cronograma
          </TabsTrigger>
          <TabsTrigger className="h-9 flex-1 lg:hidden" value="anuncios">
            Anuncios
            {urgentUnacked && <span aria-hidden className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-4">
          <div className="min-w-0">
            {/* AHORA */}
            <TabsContent className="mt-0 space-y-4" value="ahora">
              {!isViewingToday && (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Estás viendo el {formatDayLabel(selectedDay)}; los carriles se calculan con la hora actual.
                </p>
              )}

              {/* Agenda rhythm strip */}
              {milestones.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Flag aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  {milestones.map((milestone) => (
                    <Badge
                      key={milestone.id}
                      className={cn(
                        "gap-1.5 font-normal",
                        currentMilestone?.id === milestone.id
                          ? "border-primary/60 text-primary"
                          : "text-muted-foreground"
                      )}
                      variant="outline"
                    >
                      {milestone.startTime && <span className="font-terminal tabular-nums">{milestone.startTime}</span>}
                      {milestone.title}
                    </Badge>
                  ))}
                </div>
              )}

              {/* My next task */}
              {myNext && (
                <div className="rounded-lg border border-primary/40 bg-primary/[0.05] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                    <UserRound className="h-3.5 w-3.5" />
                    Tu próxima tarea
                  </p>
                  <div className="mt-2">
                    <TaskCard
                      meId={meId}
                      now={now}
                      overdue={lanes.overdueIds.has(myNext.id)}
                      task={myNext}
                      onJoin={handleJoin}
                      onLeave={handleLeave}
                      onSetStatus={handleSetStatus}
                    />
                  </div>
                </div>
              )}

              {lanes.active.length === 0 && lanes.upcoming.length === 0 && lanes.ongoing.length === 0 ? (
                <Empty
                  className="py-14"
                  description={
                    myOnly ? "No tenés tareas pendientes en este día." : "No hay tareas pendientes en este día."
                  }
                  icon={ClipboardList}
                  title="Nada pendiente"
                />
              ) : (
                /* Empty lanes are hidden on phones — a "Sin próximas" placeholder
                   costs a third of the viewport for no information. */
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    { key: "active", title: "En curso", empty: "Nada en curso", items: lanes.active, span: "" },
                    { key: "upcoming", title: "Próximas", empty: "Sin próximas", items: lanes.upcoming, span: "" },
                    {
                      key: "ongoing",
                      title: "Continuas (todo el día)",
                      empty: "Sin tareas continuas",
                      items: lanes.ongoing,
                      span: "md:col-span-2 xl:col-span-1",
                    },
                  ].map((lane) => (
                    <section
                      key={lane.key}
                      className={cn("space-y-2", lane.span, lane.items.length === 0 && "hidden md:block")}
                    >
                      <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        {lane.title}
                      </h3>
                      {lane.items.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                          {lane.empty}
                        </p>
                      ) : (
                        lane.items.map((task) => (
                          <TaskCard
                            key={task.id}
                            meId={meId}
                            now={now}
                            overdue={lanes.overdueIds.has(task.id)}
                            task={task}
                            onJoin={handleJoin}
                            onLeave={handleLeave}
                            onSetStatus={handleSetStatus}
                          />
                        ))
                      )}
                    </section>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* CRONOGRAMA */}
            <TabsContent className="mt-0" value="cronograma">
              {visibleDayTasks.length === 0 ? (
                <Empty
                  className="py-14"
                  description={
                    canEdit
                      ? "Creá la primera tarea del día con el botón «Tarea»."
                      : "Todavía no hay tareas cargadas para este día."
                  }
                  icon={ClipboardList}
                  title="Cronograma vacío"
                />
              ) : (
                <ScheduleTable
                  canEdit={canEdit}
                  isDeleting={deleteMutation.isPending}
                  meId={meId}
                  tasks={visibleDayTasks}
                  onDelete={async (task) => {
                    await deleteMutation.mutateAsync({ eventId, taskId: task.id });
                  }}
                  onEdit={(task) => {
                    setEditingTask(task);
                    setFormOpen(true);
                  }}
                  onSetStatus={handleSetStatus}
                />
              )}
            </TabsContent>

            {/* ANUNCIOS (mobile tab) */}
            <TabsContent className="mt-0 lg:hidden" value="anuncios">
              {announcementsPanel}
            </TabsContent>
          </div>

          {/* Announcements rail (desktop) */}
          <aside className="hidden lg:block">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <Megaphone className="h-3.5 w-3.5" />
              Anuncios
            </h3>
            {announcementsPanel}
          </aside>
        </div>
      </Tabs>

      <TaskFormDialog
        defaultDay={selectedDay}
        isSaving={createMutation.isPending || updateMutation.isPending}
        open={formOpen}
        roster={roster as RosterMember[]}
        task={editingTask}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingTask(null);
        }}
        onSave={handleSaveTask}
      />
    </div>
  );
}
