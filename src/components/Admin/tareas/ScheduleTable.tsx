"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Clock3, Flag, MapPin, Pencil, Trash2 } from "lucide-react";

import { cn } from "app/lib/utils";
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
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { Progress } from "components/shared/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";

import { AssigneeStack, StatusActions } from "./TaskCard";
import { STATUS_META, formatClock, isUnderstaffed, type StaffTask, type StaffTaskStatus } from "./helpers";

interface ShiftPopoverProps {
  onShift: (fromTime: string, deltaMinutes: number) => Promise<void>;
  isShifting: boolean;
}

/** "Vamos 15 tarde": slide every task from a given time onward. */
export function ShiftPopover({ onShift, isShifting }: ShiftPopoverProps) {
  const [open, setOpen] = useState(false);
  const [fromTime, setFromTime] = useState(() => formatClock(new Date()));
  const [custom, setCustom] = useState("");

  const apply = async (delta: number) => {
    if (!fromTime || Number.isNaN(delta) || delta === 0) return;
    await onShift(fromTime, delta);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="h-11 sm:h-9" size="sm" variant="outline">
          <Clock3 />
          Correr horarios
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Correr el cronograma</p>
          <p className="text-xs text-muted-foreground">
            Mueve todas las tareas del día con hora desde el horario elegido en adelante.
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="shift-from">
            Desde las
          </Label>
          <Input
            className="h-11 font-terminal tabular-nums sm:h-9 [&::-webkit-calendar-picker-indicator]:invert"
            id="shift-from"
            type="time"
            value={fromTime}
            onChange={(e) => setFromTime(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[5, 10, 15, 30, -5, -10].map((mins) => (
            <Button
              key={mins}
              className="h-11 sm:h-9"
              disabled={isShifting}
              size="sm"
              variant="outline"
              onClick={() => void apply(mins)}
            >
              {mins > 0 ? `+${mins}` : mins}
            </Button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Input
            className="h-11 tabular-nums sm:h-9"
            placeholder="±min"
            type="number"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <Button
            className="h-11 sm:h-9"
            disabled={isShifting || !custom}
            size="sm"
            onClick={() => void apply(Number(custom))}
          >
            Aplicar
          </Button>
        </div>
        {isShifting && <p className="text-xs text-muted-foreground">Corriendo…</p>}
      </PopoverContent>
    </Popover>
  );
}

interface ScheduleTableProps {
  tasks: StaffTask[];
  meId: string;
  canEdit: boolean;
  onSetStatus: (taskId: string, status: StaffTaskStatus) => void;
  onEdit: (task: StaffTask) => void;
  onDelete: (task: StaffTask) => Promise<void>;
  isDeleting: boolean;
}

function EditActions({
  task,
  onEdit,
  onDelete,
}: {
  task: StaffTask;
  onEdit: (task: StaffTask) => void;
  onDelete: (task: StaffTask) => void;
}) {
  return (
    <div className="flex justify-end gap-0.5">
      <Button aria-label={`Editar ${task.title}`} size="icon" variant="ghost" onClick={() => onEdit(task)}>
        <Pencil />
      </Button>
      <Button
        aria-label={`Eliminar ${task.title}`}
        className="text-muted-foreground hover:text-destructive"
        size="icon"
        variant="ghost"
        onClick={() => onDelete(task)}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function TimeLabel({ task }: { task: StaffTask }) {
  if (task.startTime) {
    return (
      <>
        {task.startTime}
        {task.endTime && <span className="text-muted-foreground">–{task.endTime}</span>}
      </>
    );
  }
  return <span className="text-muted-foreground">{task.type === "ongoing" ? "Todo el día" : "—"}</span>;
}

/** Full day plan. Cards on phones, table from `md` up — a 5-column grid on a
 *  390px screen wraps every title into two lines and shrinks the actions. */
export function ScheduleTable({ tasks, canEdit, onSetStatus, onEdit, onDelete, isDeleting }: ScheduleTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StaffTask | null>(null);

  const workTasks = useMemo(() => tasks.filter((task) => task.type !== "milestone"), [tasks]);
  const doneCount = workTasks.filter((task) => task.status === "done").length;
  const progress = workTasks.length > 0 ? Math.round((doneCount / workTasks.length) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Progress className="h-1.5 flex-1" value={progress} />
        <span className="font-terminal text-xs tabular-nums text-muted-foreground">
          {doneCount}/{workTasks.length} listas
        </span>
      </div>

      {/* Mobile: card list */}
      <ul className="space-y-2 md:hidden">
        {tasks.map((task) => {
          const meta = STATUS_META[task.status];
          const expanded = expandedId === task.id;

          if (task.type === "milestone") {
            return (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
              >
                <Flag className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="font-terminal text-xs font-semibold tabular-nums text-primary">
                  {task.startTime ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{task.title}</span>
                {canEdit && <EditActions task={task} onDelete={setDeleting} onEdit={onEdit} />}
              </li>
            );
          }

          return (
            <li
              key={task.id}
              className={cn("rounded-lg border border-border bg-card p-3", task.status === "done" && "opacity-60")}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-terminal text-xs font-semibold tabular-nums text-foreground">
                      <TimeLabel task={task} />
                    </span>
                    <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                    <span className="text-xs text-muted-foreground">{meta.label}</span>
                  </div>
                  <p
                    className={cn("mt-1 text-sm font-medium text-foreground", task.status === "done" && "line-through")}
                  >
                    {task.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <AssigneeStack task={task} />
                    {isUnderstaffed(task) && (
                      <Badge className="gap-1 border-primary/40 font-normal text-primary" variant="outline">
                        <AlertTriangle className="h-3 w-3" />
                        Faltan {task.minPeople! - task.assignees.length}
                      </Badge>
                    )}
                    {task.location && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {task.location}
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && <EditActions task={task} onDelete={setDeleting} onEdit={onEdit} />}
              </div>

              {task.notes && (
                <button
                  className="mt-2 flex min-h-[36px] items-center gap-1 text-xs text-muted-foreground"
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : task.id)}
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
                  Instrucciones
                </button>
              )}
              {expanded && task.notes && (
                <p className="mt-1 whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  {task.notes}
                </p>
              )}

              <div className="mt-2.5">
                <StatusActions task={task} onSetStatus={onSetStatus} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Hora</TableHead>
              <TableHead>Tarea</TableHead>
              <TableHead>Asignados</TableHead>
              <TableHead className="hidden w-40 lg:table-cell">Estado</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => {
              const meta = STATUS_META[task.status];
              const expanded = expandedId === task.id;

              if (task.type === "milestone") {
                return (
                  <TableRow key={task.id} className="bg-muted/30 hover:bg-muted/40">
                    <TableCell className="whitespace-nowrap font-terminal text-xs font-semibold tabular-nums text-primary">
                      {task.startTime ?? "—"}
                    </TableCell>
                    <TableCell colSpan={3}>
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Flag className="h-3.5 w-3.5 text-primary" />
                        {task.title}
                        {task.notes && <span className="truncate text-xs text-muted-foreground">— {task.notes}</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && <EditActions task={task} onDelete={setDeleting} onEdit={onEdit} />}
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <React.Fragment key={task.id}>
                  <TableRow className={cn(task.status === "done" && "opacity-60")}>
                    <TableCell className="whitespace-nowrap font-terminal text-xs tabular-nums text-foreground">
                      <TimeLabel task={task} />
                    </TableCell>
                    <TableCell>
                      <button
                        className="flex w-full items-start gap-1.5 text-left"
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : task.id)}
                      >
                        <div className="min-w-0">
                          <span
                            className={cn(
                              "text-sm font-medium text-foreground",
                              task.status === "done" && "line-through"
                            )}
                          >
                            {task.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2">
                            {isUnderstaffed(task) && (
                              <Badge className="gap-1 border-primary/40 font-normal text-primary" variant="outline">
                                <AlertTriangle className="h-3 w-3" />
                                Faltan {task.minPeople! - task.assignees.length}
                              </Badge>
                            )}
                            {task.location && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                {task.location}
                              </span>
                            )}
                          </span>
                        </div>
                        {task.notes && (
                          <ChevronDown
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                              expanded && "rotate-180"
                            )}
                          />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <AssigneeStack task={task} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && <EditActions task={task} onDelete={setDeleting} onEdit={onEdit} />}
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5}>
                        <div className="space-y-2 py-1">
                          {task.notes && (
                            <p className="whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                              {task.notes}
                            </p>
                          )}
                          <StatusActions task={task} onSetStatus={onSetStatus} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar &quot;{deleting?.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (!deleting) return;
                void onDelete(deleting).finally(() => setDeleting(null));
              }}
            >
              {isDeleting ? "Eliminando…" : "Eliminar tarea"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
