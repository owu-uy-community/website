"use client";

import { Check, MapPin, OctagonX, Play, RotateCcw, TriangleAlert, UserMinus, UserPlus } from "lucide-react";

import { cn } from "app/lib/utils";
import { PersonAvatar } from "components/Admin/ui/person";
import { StatusDot } from "components/Admin/ui/status";
import { SwipeRow, type SwipeAction } from "components/Admin/ui/swipe";
import { Badge } from "components/shared/ui/badge";
import { Button, type ButtonProps } from "components/shared/ui/button";

import {
  assigneeNote,
  assigneeState,
  firstName,
  isMine,
  missingPeople,
  phaseBadge,
  timeRange,
  type Assignee,
  type AssigneeState,
  type StaffArrival,
  type StaffTask,
  type StaffTaskStatus,
  type TaskPhase,
} from "./helpers";
import { DRAG_HANDLE, DROP_INSET, DROP_OUTLINE, useSeat, useTaskTarget } from "./swap";
import { undoable } from "./use-staff";

/** Where the people on a task stand, for the chips and the detail panel. */
export type PeopleContext = {
  arrivals: StaffArrival[];
  /** Minute of the task's day (see `minuteOfDay`). */
  at: number;
  isToday: boolean;
  timeZone: string;
};

/** Start, finish, block or reopen a task; nothing for milestones. */
export function StatusActions({
  task,
  onSetStatus,
  size = "sm",
  className,
}: {
  task: StaffTask;
  onSetStatus: (taskId: string, status: StaffTaskStatus) => void;
  size?: ButtonProps["size"];
  className?: string;
}) {
  if (task.type === "milestone") return null;
  const set = (status: StaffTaskStatus) => () => onSetStatus(task.id, status);

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {task.status === "pending" ? (
        <Button size={size} variant="outline" onClick={set("in_progress")}>
          <Play />
          Empezar
        </Button>
      ) : null}
      {task.status === "blocked" ? (
        <Button size={size} variant="outline" onClick={set("in_progress")}>
          <RotateCcw />
          Retomar
        </Button>
      ) : null}
      {task.status !== "done" ? (
        <Button size={size} variant="outline" onClick={set("done")}>
          <Check />
          Lista
        </Button>
      ) : null}
      {task.status === "in_progress" ? (
        <Button size={size} variant="ghost" onClick={set("blocked")}>
          <OctagonX />
          Bloqueada
        </Button>
      ) : null}
      {task.status === "done" ? (
        <Button size={size} variant="ghost" onClick={set("pending")}>
          <RotateCcw />
          Reabrir
        </Button>
      ) : null}
    </div>
  );
}

const STATE_DOT = { here: "ok", late: "live", left: "idle" } as const;

type Chip = { task: StaffTask; assignee: Assignee; state: AssigneeState; note: string | null };

const chipClass = ({ state }: Pick<Chip, "state">) =>
  cn(
    "inline-flex h-6 max-w-40 items-center gap-1.5 rounded-full border border-border bg-raised/60 pr-2 pl-0.5 text-meta text-subtle",
    state === "late" && "border-live/30 bg-live-surface text-live-foreground",
    state === "noshow" && "text-muted-foreground line-through"
  );

function ChipFace({ assignee, state, note }: Chip) {
  return (
    <>
      <span className="relative shrink-0">
        <PersonAvatar
          className={cn(state === "noshow" && "opacity-50 grayscale")}
          image={assignee.image}
          name={assignee.name}
          size={20}
        />
        {state === "here" || state === "late" || state === "left" ? (
          <StatusDot className="absolute -right-0.5 -bottom-0.5 ring-2 ring-card" tone={STATE_DOT[state]} />
        ) : null}
      </span>
      <span className="truncate">{firstName(assignee.name)}</span>
      {note ? <span className="sr-only">, {note}</span> : null}
    </>
  );
}

/** A chip an editor drags onto someone else's (they trade tasks) or onto another card (they move there). */
function SeatChip(chip: Chip) {
  const { task, assignee, note } = chip;
  const seat = useSeat({ taskId: task.id, userId: assignee.userId }, assignee, task.title);

  return (
    <li
      ref={seat.ref}
      {...seat.listeners}
      className={cn(
        chipClass(chip),
        seat.draggable && cn(DRAG_HANDLE, "cursor-grab active:cursor-grabbing"),
        seat.dragging && "opacity-40",
        DROP_OUTLINE[seat.drop]
      )}
      title={note ? `${assignee.name} · ${note}` : assignee.name}
    >
      <ChipFace {...chip} />
    </li>
  );
}

/**
 * Who is on a task, as small chips: late in red, absent struck through, a dot for who came. With `seats`, an
 * editor drags them to swap people (the Ahora cards).
 */
export function PeopleChips({
  task,
  people,
  seats = false,
  className,
}: {
  task: StaffTask;
  people: PeopleContext;
  seats?: boolean;
  className?: string;
}) {
  if (task.assignees.length === 0)
    return <p className={cn("text-meta text-muted-foreground", className)}>Sin asignar</p>;
  const arrivalOf = new Map(people.arrivals.map((arrival) => [arrival.userId, arrival]));

  return (
    <ul aria-label="Personas" className={cn("flex flex-wrap gap-1", className)}>
      {task.assignees.map((assignee) => {
        const arrival = arrivalOf.get(assignee.userId);
        const state = assigneeState(task, assignee, arrival, people.at, people.isToday);
        const chip = { task, assignee, state, note: assigneeNote(state, arrival, people.timeZone) };

        return seats ? (
          <SeatChip key={assignee.userId} {...chip} />
        ) : (
          <li
            key={assignee.userId}
            className={chipClass(chip)}
            title={chip.note ? `${assignee.name} · ${chip.note}` : assignee.name}
          >
            <ChipFace {...chip} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What a finger's swipe does on a task card: to the right, my next step (join it; start, finish or resume mine),
 * to the left, leave it. Each says what it did with a Deshacer: a swipe is easy to do by accident. The same steps
 * are the card's buttons. `at` < 0 is a day still to come: nothing to start yet.
 */
export function taskSwipes(
  task: StaffTask,
  mine: boolean,
  at: number,
  { onSetStatus, onJoin, onLeave }: Pick<SwipeHandlers, "onSetStatus" | "onJoin" | "onLeave">
): { right: SwipeAction | null; left: SwipeAction | null } {
  const status = (next: StaffTaskStatus, label: string, title: string, icon: SwipeAction["icon"]): SwipeAction => ({
    label,
    icon,
    tone: next === "done" ? "ok" : "info",
    run: () => {
      const before = task.status;
      onSetStatus(task.id, next);
      undoable(title, `«${task.title}»`, () => onSetStatus(task.id, before));
    },
  });
  const right = !mine
    ? {
        label: "Sumarme",
        icon: UserPlus,
        tone: "ok" as const,
        run: () => {
          onJoin(task.id);
          undoable("Te sumaste", `«${task.title}»`, () => onLeave(task.id));
        },
      }
    : at < 0
      ? null
      : task.status === "pending"
        ? status("in_progress", "Empezar", "La empezaste", Play)
        : task.status === "in_progress"
          ? status("done", "Terminar", "La terminaste", Check)
          : task.status === "blocked"
            ? status("in_progress", "Retomar", "La retomaste", RotateCcw)
            : null;
  const left = mine
    ? {
        label: "Bajarme",
        icon: UserMinus,
        tone: "warn" as const,
        run: () => {
          onLeave(task.id);
          undoable("Te bajaste", `«${task.title}»`, () => onJoin(task.id));
        },
      }
    : null;

  return { right, left };
}

type SwipeHandlers = {
  onSetStatus: (taskId: string, status: StaffTaskStatus) => void;
  onJoin: (taskId: string) => void;
  onLeave: (taskId: string) => void;
};

/** A task in the "Ahora" lanes: its time and state first, then who is on it and what to do next. */
export function TaskCard({
  task,
  phase,
  meId,
  people,
  onOpen,
  onSetStatus,
  onJoin,
  onLeave,
}: {
  task: StaffTask;
  phase: TaskPhase;
  meId: string;
  people: PeopleContext;
  onOpen: (taskId: string) => void;
  onSetStatus: (taskId: string, status: StaffTaskStatus) => void;
  onJoin: (taskId: string) => void;
  onLeave: (taskId: string) => void;
}) {
  const mine = isMine(task, meId);
  const missing = missingPeople(task);
  const badge = phaseBadge(task, phase);
  const range = timeRange(task);
  const target = useTaskTarget(task);
  const swipes = taskSwipes(task, mine, people.at, { onSetStatus, onJoin, onLeave });

  return (
    <SwipeRow className="rounded-lg" left={swipes.left} right={swipes.right}>
      <article
        ref={target.setNodeRef}
        className={cn(
          "cursor-pointer rounded-lg border border-border bg-card p-3 shadow-edge transition-colors hover:border-input",
          mine && "border-primary/30 hover:border-primary/45",
          DROP_INSET[target.state]
        )}
        // The whole card opens the task: a finger rarely lands on the title. Its buttons keep their own job.
        onClick={(event) => !(event.target as HTMLElement).closest("button") && onOpen(task.id)}
      >
        <div className="flex items-start gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 pt-0.5">
            {range ? (
              <span className="mr-0.5 font-terminal text-meta whitespace-nowrap text-foreground tabular-nums">
                {range}
              </span>
            ) : null}
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {missing > 0 ? (
              <Badge variant="warning">
                <TriangleAlert />
                Faltan {missing}
              </Badge>
            ) : null}
          </div>
          <Button
            aria-label={mine ? `Bajarme de ${task.title}` : `Sumarme a ${task.title}`}
            className="-mt-0.5 -mr-1"
            size="sm"
            variant="ghost"
            onClick={() => (mine ? onLeave(task.id) : onJoin(task.id))}
          >
            {mine ? <UserMinus /> : <UserPlus />}
            {mine ? "Bajarme" : "Sumarme"}
          </Button>
        </div>
        <button
          className="mt-1.5 block w-full rounded-sm text-left text-ui font-semibold text-foreground decoration-input underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
          type="button"
          onClick={() => onOpen(task.id)}
        >
          {task.title}
        </button>
        {task.location ? (
          <p className="mt-0.5 flex items-center gap-1 text-meta text-muted-foreground">
            <MapPin aria-hidden className="size-3" />
            {task.location}
          </p>
        ) : null}
        <PeopleChips seats className="mt-2" people={people} task={task} />
        {/* Nothing to start or finish on a day still to come. */}
        {people.at >= 0 ? <StatusActions className="mt-2.5" task={task} onSetStatus={onSetStatus} /> : null}
      </article>
    </SwipeRow>
  );
}
