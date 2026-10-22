"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, ListChecks, MapPin, Pencil, TimerReset } from "lucide-react";

import { cn } from "app/lib/utils";
import { Meter, Panel, PanelHead } from "components/Admin/ui/page";
import { AvatarStack } from "components/Admin/ui/person";
import { Badge, badgeVariants } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import { taskPhase } from "lib/orpc/staff-tasks/shift";

import { assigneeState, formatDayLabel, missingPeople, phaseBadge, plural, timeRange, type StaffTask } from "./helpers";
import { DRAG_HANDLE, DROP_INSET, DROP_ROW, useTimes } from "./swap";
import { PeopleChips, type PeopleContext } from "./TaskCard";
import { staffKeys } from "./use-staff";

/** A task on the Cronograma: an editor drags it onto another task and the two trade their times. */
function useTimesHandle(
  task: StaffTask,
  layout: string,
  look: Record<"idle" | "candidate" | "over" | "refused", string>
) {
  const times = useTimes(task, layout);

  return {
    ref: times.ref,
    ...times.listeners,
    className: cn(times.draggable && DRAG_HANDLE, times.dragging && "opacity-40", look[times.drop]),
    // A drag across the list isn't a swipe to the next tab.
    "data-swipe-ignore": times.draggable ? "" : undefined,
  };
}

function TimesRow({
  task,
  className,
  onClick,
  children,
}: {
  task: StaffTask;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const handle = useTimesHandle(task, "table", DROP_ROW);

  return (
    <TableRow {...handle} className={cn(className, handle.className)} onClick={onClick}>
      {children}
    </TableRow>
  );
}

function TimesItem({ task, className, children }: { task: StaffTask; className?: string; children: ReactNode }) {
  const handle = useTimesHandle(task, "list", DROP_INSET);

  return (
    <li {...handle} className={cn(className, handle.className)}>
      {children}
    </li>
  );
}

const STEPS = [5, 10, 15, 30, -5, -10];

/** "Vamos 15 tarde": slide every timed task of the day from a given time on. */
export function ShiftPopover({ eventId, dayDate, now }: { eventId: string; dayDate: string; now: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fromTime, setFromTime] = useState(now);
  const [custom, setCustom] = useState("");
  const shift = useMutation(
    orpc.staffTasks.shiftFrom.mutationOptions({
      onSuccess: ({ count }, { deltaMinutes }) => {
        setOpen(false);
        setCustom("");
        toast.success(
          count > 0 ? `Corriste ${plural(count, "tarea", "tareas")}` : "No había tareas para correr",
          count > 0
            ? `${deltaMinutes > 0 ? "+" : "−"}${Math.abs(deltaMinutes)} min desde las ${fromTime}.`
            : `Nada empieza después de las ${fromTime}.`
        );
        void queryClient.invalidateQueries({ queryKey: staffKeys(eventId).tasks });
      },
      onError: (error) => toast.error("No se pudo correr el cronograma", error.message),
    })
  );
  const apply = (deltaMinutes: number) => {
    if (!fromTime || !Number.isInteger(deltaMinutes) || deltaMinutes === 0) return;
    shift.mutate({ eventId, dayDate, fromTime, deltaMinutes });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setFromTime(now);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button aria-label="Correr horarios" variant="outline">
          <TimerReset />
          <span className="max-sm:hidden">Correr horarios</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] space-y-3">
        <div>
          <p className="text-ui font-semibold text-foreground">Correr horarios</p>
          <p className="mt-0.5 text-meta text-muted-foreground">
            Mueve las tareas del {formatDayLabel(dayDate)} que empiezan desde esta hora.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shift-from">Desde las</Label>
          <Input
            className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
            id="shift-from"
            type="time"
            value={fromTime}
            onChange={(event) => setFromTime(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {STEPS.map((minutes) => (
            <Button
              key={minutes}
              className="font-terminal tabular-nums"
              disabled={shift.isPending}
              size="sm"
              variant="outline"
              onClick={() => apply(minutes)}
            >
              {minutes > 0 ? `+${minutes}` : `−${Math.abs(minutes)}`}
            </Button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Input
            aria-label="Otros minutos (negativos para adelantar)"
            // A number field: an iPhone's numeric keypad has no minus sign, and this one takes negatives.
            className="[appearance:textfield] font-terminal tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
            enterKeyHint="go"
            placeholder="±min"
            step={1}
            type="number"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && custom && apply(Number(custom))}
          />
          <Button
            disabled={shift.isPending || !custom}
            size="default"
            variant="outline"
            onClick={() => apply(Number(custom))}
          >
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The day's plan, in order: a table on desktop, a list on phones. Selecting a task opens it. */
export function ScheduleTable({
  tasks,
  people,
  canEdit,
  onOpen,
  onEdit,
}: {
  tasks: StaffTask[];
  people: PeopleContext;
  canEdit: boolean;
  onOpen: (taskId: string) => void;
  onEdit: (task: StaffTask) => void;
}) {
  const work = tasks.filter((task) => task.type !== "milestone");
  const done = work.filter((task) => task.status === "done").length;
  const arrivalOf = new Map(people.arrivals.map((arrival) => [arrival.userId, arrival]));
  const lateCount = (task: StaffTask) =>
    task.assignees.filter(
      (assignee) => assigneeState(task, assignee, arrivalOf.get(assignee.userId), people.at, people.isToday) === "late"
    ).length;

  return (
    <Panel className="overflow-clip">
      <PanelHead
        actions={
          <Meter className="w-28 max-sm:hidden" label="Tareas listas" max={work.length} tone="success" value={done} />
        }
        icon={ListChecks}
        meta={`${done} de ${work.length} ${work.length === 1 ? "lista" : "listas"}`}
        title="Cronograma"
      />

      {/* Phones: one card per task. */}
      <ul className="divide-y divide-border md:hidden">
        {tasks.map((task) => {
          const range = timeRange(task);
          if (task.type === "milestone") {
            return (
              <TimesItem key={task.id} className="flex items-center gap-2 bg-info-surface/30 px-3.5 py-2.5" task={task}>
                <Flag aria-hidden className="size-3.5 shrink-0 text-info-foreground" />
                <span className="font-terminal text-meta text-info-foreground tabular-nums">
                  {task.startTime ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-ui font-medium text-foreground">{task.title}</span>
              </TimesItem>
            );
          }
          const badge = phaseBadge(task, taskPhase(task, people.at));
          return (
            <TimesItem key={task.id} task={task}>
              <button
                className="block w-full px-3.5 py-3 text-left focus-visible:bg-raised focus-visible:outline-hidden active:bg-raised"
                type="button"
                onClick={() => onOpen(task.id)}
              >
                <span className="flex items-center gap-2">
                  <span className="font-terminal text-meta text-foreground tabular-nums">{range ?? "Sin hora"}</span>
                  <span className={badgeVariants({ variant: badge.variant })}>{badge.label}</span>
                  {missingPeople(task) > 0 ? (
                    <span className={badgeVariants({ variant: "warning" })}>Faltan {missingPeople(task)}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-ui font-medium text-foreground",
                    task.status === "done" && "text-muted-foreground line-through"
                  )}
                >
                  {task.title}
                </span>
                {task.location ? (
                  <span className="mt-0.5 block text-meta text-muted-foreground">{task.location}</span>
                ) : null}
                <PeopleChips className="mt-2" people={people} task={task} />
              </button>
            </TimesItem>
          );
        })}
      </ul>

      {/* Desktop: the table, its header stuck under the page header while it scrolls. */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-28 pl-3.5">Hora</TableHead>
            <TableHead>Tarea</TableHead>
            <TableHead className="w-48">Personas</TableHead>
            <TableHead className="w-28">Estado</TableHead>
            {canEdit ? <TableHead className="w-10" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const range = timeRange(task);
            if (task.type === "milestone") {
              return (
                <TimesRow key={task.id} className="bg-info-surface/25 hover:bg-info-surface/40" task={task}>
                  <TableCell className="h-9 pl-3.5 font-terminal text-meta text-info-foreground tabular-nums">
                    {task.startTime ?? "—"}
                  </TableCell>
                  <TableCell className="h-9" colSpan={3}>
                    <span className="flex items-center gap-2 text-ui font-medium text-foreground">
                      <Flag aria-hidden className="size-3.5 text-info-foreground" />
                      {task.title}
                      {task.location ? (
                        <span className="text-meta font-normal text-muted-foreground">· {task.location}</span>
                      ) : null}
                    </span>
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="h-9 pr-2 text-right">
                      <Button
                        aria-label={`Editar ${task.title}`}
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onEdit(task)}
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  ) : null}
                </TimesRow>
              );
            }
            const badge = phaseBadge(task, taskPhase(task, people.at));
            const missing = missingPeople(task);
            const late = lateCount(task);
            return (
              <TimesRow key={task.id} className="cursor-pointer" task={task} onClick={() => onOpen(task.id)}>
                <TableCell className="pl-3.5 font-terminal text-meta whitespace-nowrap text-foreground tabular-nums">
                  {range ?? (
                    <span className="text-muted-foreground">
                      {task.type === "ongoing" ? "Todo el día" : "Sin hora"}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <button
                    className={cn(
                      "rounded-sm text-left text-ui font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
                      task.status === "done" && "text-muted-foreground line-through"
                    )}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(task.id);
                    }}
                  >
                    {task.title}
                  </button>
                  {task.location ? (
                    <span className="mt-0.5 flex items-center gap-1 text-meta text-muted-foreground">
                      <MapPin aria-hidden className="size-3" />
                      {task.location}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {task.assignees.length > 0 ? (
                      <AvatarStack
                        max={4}
                        people={task.assignees.map((assignee) => ({
                          id: assignee.userId,
                          name: assignee.name,
                          image: assignee.image,
                          title: assignee.noShow ? `${assignee.name} · no vino` : assignee.name,
                        }))}
                      />
                    ) : (
                      <span className="text-meta text-muted-foreground">Sin asignar</span>
                    )}
                    {missing > 0 ? <Badge variant="warning">Faltan {missing}</Badge> : null}
                    {late > 0 ? (
                      <span className="text-meta text-live-foreground">
                        {late === 1 ? "1 no llegó" : `${late} no llegaron`}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </TableCell>
                {canEdit ? (
                  <TableCell className="pr-2 text-right">
                    <Button
                      aria-label={`Editar ${task.title}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(task);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                ) : null}
              </TimesRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
