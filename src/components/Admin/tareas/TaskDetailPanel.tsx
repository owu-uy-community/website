"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowUpDown,
  CircleCheck,
  Flag,
  MapPin,
  Pencil,
  Repeat,
  UserMinus,
  UserPlus,
  UserRoundX,
  Users,
  X,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { EditorPanel, Notice, PanelSection } from "components/Admin/panel";
import { PersonAvatar } from "components/Admin/ui/person";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { orpc } from "lib/orpc";

import {
  assigneeNote,
  assigneeState,
  formatDayLabel,
  isMine,
  missingPeople,
  phaseBadge,
  plural,
  timeRange,
  type RosterMember,
  type StaffArrival,
  type StaffTask,
  type StaffTaskStatus,
  type TaskPhase,
} from "./helpers";
import { RosterPicker } from "./RosterPicker";
import { SeatSwapMenu, TimesSwapMenu } from "./swap";
import { StatusActions, type PeopleContext } from "./TaskCard";
import { staffKeys, useOptimistic, withArrival, withTask } from "./use-staff";

/**
 * A task up close: when and where, its state, and each person on it with whether they came.
 * Editors mark arrivals and absences and change who is on it from here.
 */
export function TaskDetailPanel({
  task,
  phase,
  open,
  onOpenChange,
  eventId,
  me,
  canEdit,
  today,
  people,
  roster,
  free,
  onEdit,
  onSetStatus,
  onJoin,
  onLeave,
}: {
  task: StaffTask | null;
  phase: TaskPhase;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  me: { id: string; name: string; image: string | null };
  canEdit: boolean;
  today: string;
  people: PeopleContext;
  roster: RosterMember[];
  free: ReadonlySet<string>;
  onEdit: (task: StaffTask) => void;
  onSetStatus: (taskId: string, status: StaffTaskStatus) => void;
  onJoin: (taskId: string) => void;
  onLeave: (taskId: string) => void;
}) {
  const keys = staffKeys(eventId);
  const optimistic = useOptimistic();

  const noShow = useMutation(
    orpc.staffTasks.setNoShow.mutationOptions(
      optimistic<StaffTask[], { taskId: string; userId: string; noShow: boolean }>(
        keys.tasks,
        (tasks, input) =>
          withTask(tasks, input.taskId, (current) => ({
            ...current,
            assignees: current.assignees.map((assignee) =>
              assignee.userId === input.userId ? { ...assignee, noShow: input.noShow } : assignee
            ),
          })),
        "No se pudo marcar la ausencia",
        [keys.onShift]
      )
    )
  );
  const arrive = useMutation(
    orpc.staffTasks.arrivals.arrive.mutationOptions(
      optimistic<StaffArrival[], { userId?: string }>(
        keys.arrivals,
        (arrivals, input) => {
          const person = task?.assignees.find((assignee) => assignee.userId === input.userId);
          return person
            ? withArrival(arrivals, { ...person, arrivedAt: new Date().toISOString(), leftAt: null })
            : arrivals;
        },
        "No se pudo marcar la llegada",
        [keys.onShift]
      )
    )
  );
  const assign = useMutation(
    orpc.staffTasks.assign.mutationOptions(
      optimistic<StaffTask[], { taskId: string; userId: string }>(
        keys.tasks,
        (tasks, input) => {
          const member = roster.find((candidate) => candidate.userId === input.userId);
          return member
            ? withTask(tasks, input.taskId, (current) => ({
                ...current,
                assignees: [
                  ...current.assignees,
                  { userId: member.userId, name: member.name, image: member.image, noShow: false },
                ],
              }))
            : tasks;
        },
        "No se pudo sumar a esa persona",
        [keys.onShift]
      )
    )
  );
  const unassign = useMutation(
    orpc.staffTasks.unassign.mutationOptions(
      optimistic<StaffTask[], { taskId: string; userId: string }>(
        keys.tasks,
        (tasks, input) =>
          withTask(tasks, input.taskId, (current) => ({
            ...current,
            assignees: current.assignees.filter((assignee) => assignee.userId !== input.userId),
          })),
        "No se pudo sacar a esa persona",
        [keys.onShift]
      )
    )
  );

  if (!task) return null;
  const arrivalOf = new Map(people.arrivals.map((arrival) => [arrival.userId, arrival]));
  const badge = phaseBadge(task, phase);
  const missing = missingPeople(task);
  const range = timeRange(task);
  const Icon = task.type === "milestone" ? Flag : task.type === "ongoing" ? Repeat : Users;
  const when = [task.dayDate !== today ? formatDayLabel(task.dayDate) : null, range ?? "Sin hora"].filter(Boolean);

  return (
    <EditorPanel
      actions={
        canEdit ? (
          <>
            <TimesSwapMenu
              task={task}
              onDone={() => onOpenChange(false)}
              trigger={
                <Button type="button" variant="outline">
                  <ArrowUpDown />
                  <span className="max-sm:sr-only">Intercambiar horario con…</span>
                  <span aria-hidden className="sm:hidden">
                    Horario…
                  </span>
                </Button>
              }
            />
            <Button type="button" variant="outline" onClick={() => onEdit(task)}>
              <Pencil />
              Editar
            </Button>
          </>
        ) : undefined
      }
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-terminal tabular-nums">{when.join(" · ")}</span>
          {task.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-3" />
              {task.location}
            </span>
          ) : null}
        </span>
      }
      icon={Icon}
      open={open}
      title={task.title}
      onOpenChange={onOpenChange}
    >
      <div className="space-y-7">
        {task.type === "milestone" ? (
          <p className="text-ui text-muted-foreground">Un momento de la agenda del día. No lleva personas.</p>
        ) : (
          <>
            <PanelSection title="Estado">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={badge.variant}>{badge.label}</Badge>
                {missing > 0 ? <Badge variant="warning">Faltan {missing}</Badge> : null}
              </div>
              <StatusActions size="default" task={task} onSetStatus={onSetStatus} />
            </PanelSection>

            <PanelSection
              action={
                <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                  {task.minPeople
                    ? `${task.assignees.length} de ${task.minPeople}`
                    : plural(task.assignees.length, "persona", "personas")}
                </span>
              }
              title="Personas"
            >
              <Notice show={missing > 0} tone="warning">
                Faltan {plural(missing, "persona", "personas")} para el mínimo de {task.minPeople}.
              </Notice>
              {task.assignees.length === 0 ? (
                <p className="text-ui text-muted-foreground">Nadie todavía.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {task.assignees.map((assignee) => {
                    const arrival = arrivalOf.get(assignee.userId);
                    const state = assigneeState(task, assignee, arrival, people.at, people.isToday);
                    const note = assigneeNote(state, arrival, people.timeZone);
                    return (
                      <li key={assignee.userId} className="flex min-h-12 items-center gap-2.5 px-3 py-2">
                        <span className="relative shrink-0">
                          <PersonAvatar
                            className={cn(state === "noshow" && "opacity-50 grayscale")}
                            image={assignee.image}
                            name={assignee.name}
                            size={28}
                          />
                          {state === "here" || state === "late" ? (
                            <StatusDot
                              className="absolute -right-0.5 -bottom-0.5 size-2.5 ring-2 ring-popover"
                              tone={state === "here" ? "ok" : "live"}
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-ui text-foreground",
                              state === "noshow" && "text-muted-foreground line-through"
                            )}
                          >
                            {assignee.name}
                            {assignee.userId === me.id ? <span className="text-muted-foreground"> (vos)</span> : null}
                          </span>
                          {note ? (
                            <span
                              className={cn(
                                "block text-meta text-muted-foreground",
                                state === "late" && "text-live-foreground"
                              )}
                            >
                              {note}
                            </span>
                          ) : null}
                        </span>
                        {canEdit ? (
                          <span className="flex shrink-0 items-center gap-1">
                            {people.isToday && (state === "late" || state === "unknown") ? (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => arrive.mutate({ eventId, userId: assignee.userId })}
                              >
                                <CircleCheck />
                                Llegó
                              </Button>
                            ) : null}
                            <Button
                              aria-pressed={assignee.noShow}
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                noShow.mutate({
                                  eventId,
                                  taskId: task.id,
                                  userId: assignee.userId,
                                  noShow: !assignee.noShow,
                                })
                              }
                            >
                              <UserRoundX />
                              {assignee.noShow ? "Sí vino" : "No vino"}
                            </Button>
                            <SeatSwapMenu
                              seat={{ taskId: task.id, userId: assignee.userId }}
                              onDone={() => onOpenChange(false)}
                              trigger={
                                <Button
                                  aria-label={`Cambiar a ${assignee.name} con…`}
                                  size="icon-xs"
                                  title="Cambiar con…"
                                  variant="ghost"
                                >
                                  <ArrowLeftRight />
                                </Button>
                              }
                            />
                            <Button
                              aria-label={`Sacar a ${assignee.name} de la tarea`}
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => unassign.mutate({ eventId, taskId: task.id, userId: assignee.userId })}
                            >
                              <X />
                            </Button>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {isMine(task, me.id) ? (
                  <Button size="sm" variant="ghost" onClick={() => onLeave(task.id)}>
                    <UserMinus />
                    Bajarme
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onJoin(task.id)}>
                    <UserPlus />
                    Sumarme
                  </Button>
                )}
                {canEdit ? (
                  <RosterPicker
                    free={free}
                    roster={roster}
                    selected={task.assignees.map((assignee) => assignee.userId)}
                    onToggle={(userId) =>
                      task.assignees.some((assignee) => assignee.userId === userId)
                        ? unassign.mutate({ eventId, taskId: task.id, userId })
                        : assign.mutate({ eventId, taskId: task.id, userId })
                    }
                  >
                    <Button size="sm" variant="outline">
                      <Users />
                      Sumar a alguien
                    </Button>
                  </RosterPicker>
                ) : null}
              </div>
            </PanelSection>
          </>
        )}

        {task.notes ? (
          <PanelSection title="Instrucciones">
            <p className="text-ui leading-relaxed whitespace-pre-line text-subtle">{task.notes}</p>
          </PanelSection>
        ) : null}
      </div>
    </EditorPanel>
  );
}
