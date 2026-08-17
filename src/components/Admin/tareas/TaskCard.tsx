"use client";

import * as React from "react";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  MapPin,
  OctagonX,
  Play,
  RotateCcw,
  UserPlus,
  UserMinus,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "components/shared/ui/avatar";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/shared/ui/tooltip";

import { STATUS_META, initials, isMine, isUnderstaffed, type StaffTask, type StaffTaskStatus } from "./helpers";

export function AssigneeStack({ task, max = 4 }: { task: StaffTask; max?: number }) {
  const shown = task.assignees.slice(0, max);
  const extra = task.assignees.length - shown.length;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((assignee) => (
          <Tooltip key={assignee.userId}>
            <TooltipTrigger asChild>
              <Avatar className="h-6 w-6 border border-border bg-muted">
                {assignee.image ? <AvatarImage alt={assignee.name} src={assignee.image} /> : null}
                <AvatarFallback className="text-[9px]">{initials(assignee.name)}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>{assignee.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {extra > 0 && <span className="ml-1.5 text-xs text-muted-foreground">+{extra}</span>}
      {task.assignees.length === 0 && <span className="text-xs text-muted-foreground">Sin asignar</span>}
    </div>
  );
}

/** Touch-first: full-width 44px targets on phones, compact from `sm` up. */
const ACTION_CLASS = "h-11 flex-1 sm:h-9 sm:flex-none";

export function StatusActions({
  task,
  onSetStatus,
  disabled,
}: {
  task: StaffTask;
  onSetStatus: (taskId: string, status: StaffTaskStatus) => void;
  disabled?: boolean;
}) {
  if (task.type === "milestone") return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {task.status === "pending" && (
        <Button
          className={ACTION_CLASS}
          disabled={disabled}
          size="sm"
          variant="outline"
          onClick={() => onSetStatus(task.id, "in_progress")}
        >
          <Play />
          Empezar
        </Button>
      )}
      {task.status === "blocked" && (
        <Button
          className={ACTION_CLASS}
          disabled={disabled}
          size="sm"
          variant="outline"
          onClick={() => onSetStatus(task.id, "in_progress")}
        >
          <RotateCcw />
          Retomar
        </Button>
      )}
      {task.status !== "done" && (
        <Button className={ACTION_CLASS} disabled={disabled} size="sm" onClick={() => onSetStatus(task.id, "done")}>
          <Check />
          Lista
        </Button>
      )}
      {task.status === "in_progress" && (
        <Button
          className={cn(ACTION_CLASS, "text-destructive hover:bg-destructive/10 hover:text-destructive")}
          disabled={disabled}
          size="sm"
          variant="ghost"
          onClick={() => onSetStatus(task.id, "blocked")}
        >
          <OctagonX />
          Bloqueada
        </Button>
      )}
      {task.status === "done" && (
        <Button
          className={cn(ACTION_CLASS, "text-muted-foreground")}
          disabled={disabled}
          size="sm"
          variant="ghost"
          onClick={() => onSetStatus(task.id, "pending")}
        >
          <RotateCcw />
          Reabrir
        </Button>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: StaffTask;
  meId: string;
  now: Date;
  overdue?: boolean;
  onSetStatus: (taskId: string, status: StaffTaskStatus) => void;
  onJoin: (taskId: string) => void;
  onLeave: (taskId: string) => void;
}

/** Card for the "Ahora" lanes — status-first, notes on demand. */
export function TaskCard({ task, meId, overdue = false, onSetStatus, onJoin, onLeave }: TaskCardProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const mine = isMine(task, meId);
  const understaffed = isUnderstaffed(task);
  const meta = STATUS_META[task.status];

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 transition-colors",
        task.status === "done" && "opacity-60",
        mine && task.status !== "done" && "border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {task.startTime && (
              <span className="font-terminal text-xs font-semibold tabular-nums text-foreground">
                {task.startTime}
                {task.endTime ? `–${task.endTime}` : ""}
              </span>
            )}
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            <span className="text-xs text-muted-foreground">{meta.label}</span>
            {overdue && task.status !== "done" && (
              <span className="text-xs font-medium text-destructive">atrasada</span>
            )}
            {task.type === "ongoing" && (
              <Badge className="font-normal" variant="secondary">
                Continuo
              </Badge>
            )}
          </div>
          <p className={cn("mt-1 text-sm font-semibold text-foreground", task.status === "done" && "line-through")}>
            {task.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <AssigneeStack task={task} />
            {understaffed && (
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

        {task.type !== "milestone" && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {mine ? (
              <Button
                aria-label="Bajarme de la tarea"
                className="h-9 px-2 text-xs text-muted-foreground"
                size="sm"
                variant="ghost"
                onClick={() => onLeave(task.id)}
              >
                <UserMinus />
                Bajarme
              </Button>
            ) : (
              <Button
                aria-label="Sumarme a la tarea"
                className="h-9 px-2 text-xs"
                size="sm"
                variant="outline"
                onClick={() => onJoin(task.id)}
              >
                <UserPlus />
                Sumarme
              </Button>
            )}
          </div>
        )}
      </div>

      {task.notes && (
        <div className="mt-2">
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            type="button"
            onClick={() => setNotesOpen((open) => !open)}
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", notesOpen && "rotate-180")} />
            Instrucciones
          </button>
          {notesOpen && (
            <p className="mt-1.5 whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {task.notes}
            </p>
          )}
        </div>
      )}

      <div className="mt-2.5">
        <StatusActions task={task} onSetStatus={onSetStatus} />
      </div>
    </div>
  );
}
