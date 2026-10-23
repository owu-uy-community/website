"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleCheck, ListChecks, Users } from "lucide-react";

import { Meter, Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { Checkbox } from "components/shared/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { daysBetween } from "lib/calendar/holidays";
import { dayKey } from "lib/community/time";
import type { ChecklistRow } from "lib/organizar/checklist";
import { TEMPLATE_LABEL, TEMPLATE_TASKS, TEMPLATES, type TemplateName } from "lib/organizar/task-templates";
import { shortDay } from "lib/organizar/times";
import { orpc } from "lib/orpc/client";
import type { EventTasks } from "lib/orpc/events/schemas";

import { usePanel } from "../shell/context";
import type { EventInput } from "./save";

const NOBODY = "nadie";

/** "hoy", "mañana", "en 3 días", "venció hace 2 días": when a task is due, from today */
function dueLabel(day: string, today: string) {
  const days = daysBetween(today, day);
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days > 1) return `en ${days} días`;

  return days === -1 ? "venció ayer" : `venció hace ${-days} días`;
}

/** One computed row, GOV.UK's task list: the whole row is the link; the state in plain words. */
function Row({ row }: { row: ChecklistRow }) {
  return (
    <li>
      <Link
        className="group flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised/60 focus-visible:bg-raised/60"
        href={row.href}
      >
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-ui text-foreground underline-offset-4 group-hover:underline">{row.title}</p>
          <p className="truncate text-meta text-muted-foreground">{row.meta}</p>
        </div>
        {row.done ? (
          <span className="flex shrink-0 items-center gap-1 text-meta text-success-foreground">
            <CircleCheck aria-hidden className="size-4" />
            Listo
          </span>
        ) : (
          <span className="shrink-0 rounded-sm bg-raised px-1.5 py-0.5 text-meta text-foreground">Falta</span>
        )}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}

/** The team's tasks: tick them (with undo), say who does each, and add a template's when there are none. */
function Tasks({ input, data, today }: { input: EventInput; data: EventTasks; today: string }) {
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const [template, setTemplate] = useState<TemplateName | null>(null);
  const chosen = template ?? data.suggested;
  const roster = useQuery({
    ...orpc.staffTasks.roster.queryOptions({ input: { eventId: input.eventId } }),
    enabled: can("task:manage"),
    staleTime: 5 * 60_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.events.tasks.key() });
  const apply = useMutation(
    orpc.events.applyTemplate.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(orpc.events.tasks.queryKey({ input }), result);
        toast.success("Tareas sumadas", "Cada una con su día; se mueven si el evento cambia de fecha.");
      },
      onError: (error) => toast.error("No se pudieron sumar", error.message),
    })
  );
  const status = useMutation(
    orpc.staffTasks.setStatus.mutationOptions({
      onSettled: refresh,
      onError: (error) => toast.error("No se pudo marcar", error.message),
    })
  );
  const assign = useMutation(
    orpc.staffTasks.update.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error("No se pudo asignar", error.message),
    })
  );

  if (data.tasks.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3">
        <p className="text-meta text-muted-foreground">
          La lista de siempre, con un día para cada cosa: pedir el lugar, anunciarlo, la comida, agradecer.
        </p>
        {can("event:update") ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={chosen} onValueChange={(value) => setTemplate(value as TemplateName)}>
              <SelectTrigger aria-label="Qué lista de tareas" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {TEMPLATE_LABEL[name]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={apply.isPending}
              size="sm"
              variant="outline"
              onClick={() => apply.mutate({ ...input, template: chosen })}
            >
              Sumar {TEMPLATE_TASKS[chosen].length} tareas
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {data.load ? (
        <p className="flex items-start gap-2 border-b border-border px-4 py-2.5 text-meta text-muted-foreground">
          <Users aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {`En los últimos eventos ${data.load.name} hizo ${Math.round(data.load.share * 100)} % de las tareas. Repartí las tareas: que cada una tenga a alguien distinto.`}
        </p>
      ) : null}
      <ul aria-label="Tareas del equipo" className="divide-y divide-border">
        {data.tasks.map((task) => {
          const done = task.status === "done";
          const id = `task-${task.id}`;

          return (
            <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
              <Checkbox
                aria-label={`${task.title}: hecha`}
                checked={done}
                disabled={!can("task:work")}
                id={id}
                onCheckedChange={(on) => {
                  status.mutate({ eventId: input.eventId, taskId: task.id, status: on ? "done" : "pending" });
                  if (on) {
                    toast.undo(`«${task.title}» lista`, () =>
                      status.mutate({ eventId: input.eventId, taskId: task.id, status: "pending" })
                    );
                  }
                }}
              />
              <label className="min-w-0 flex-1 leading-tight" htmlFor={id}>
                <span className={done ? "text-ui text-muted-foreground line-through" : "text-ui text-foreground"}>
                  {task.title}
                </span>
                <span className="block text-meta text-muted-foreground tabular-nums">
                  {shortDay(task.dayDate)}
                  {done ? "" : ` · ${dueLabel(task.dayDate, today)}`}
                </span>
              </label>
              {can("task:manage") && roster.data ? (
                <Select
                  value={task.assignees[0]?.userId ?? NOBODY}
                  onValueChange={(userId) =>
                    assign.mutate({
                      eventId: input.eventId,
                      taskId: task.id,
                      data: { assigneeIds: userId === NOBODY ? [] : [userId] },
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={`Quién se encarga de «${task.title}»`}
                    className="h-8 w-44 max-sm:ml-7 max-sm:w-[calc(100%-1.75rem)]"
                  >
                    <SelectValue placeholder="¿Quién se encarga?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOBODY}>¿Quién se encarga?</SelectItem>
                    {roster.data.map((person) => (
                      <SelectItem key={person.userId} value={person.userId}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-meta text-muted-foreground">
                  {task.assignees.map((person) => person.name).join(", ") || "Sin asignar"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * "Antes": what the event needs, computed from it (each row is the link to where it's done), and
 * the team's tasks. When everything is done it folds into "Listo para el día".
 */
export function ReadyList({ rows, input }: { rows: ChecklistRow[]; input: EventInput }) {
  const today = dayKey(new Date());
  const tasks = useQuery(orpc.events.tasks.queryOptions({ input }));
  const [open, setOpen] = useState(false);
  const done = rows.filter((row) => row.done).length;
  const tasksDone = tasks.data?.tasks.filter((task) => task.status === "done").length ?? 0;
  const tasksTotal = tasks.data?.tasks.length ?? 0;
  const ready = done === rows.length && tasksDone === tasksTotal && tasks.isSuccess;

  if (ready && !open) {
    return (
      <Panel className="flex items-center gap-3 p-4">
        <CircleCheck aria-hidden className="size-5 text-success" />
        <p className="flex-1 text-ui font-medium text-foreground">Listo para el día</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Ver la lista
        </Button>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHead
        actions={<Meter className="w-28 max-sm:hidden" label="Antes del evento" max={rows.length} value={done} />}
        icon={ListChecks}
        meta={`${done} de ${rows.length} listo`}
        title="Antes del evento"
      />
      <ul aria-label="Lo que necesita el evento" className="divide-y divide-border">
        {rows.map((row) => (
          <Row key={row.key} row={row} />
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-border px-4 pt-3 pb-1">
        <h3 className="text-ui font-medium text-foreground">Tareas del equipo</h3>
        {tasksTotal > 0 ? (
          <span className="text-meta text-muted-foreground tabular-nums">
            {tasksDone} de {tasksTotal} hechas
          </span>
        ) : null}
      </div>
      {tasks.isError ? (
        <ErrorState className="m-3" compact title="No pudimos traer las tareas" onRetry={() => void tasks.refetch()} />
      ) : tasks.data ? (
        <Tasks data={tasks.data} input={input} today={today} />
      ) : (
        <Skeleton className="m-4 h-16" />
      )}
    </Panel>
  );
}
