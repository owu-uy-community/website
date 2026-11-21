"use client";

// Swaps on Staff y tareas. Drag a person onto another person and they trade tasks, onto another task and they
// move there; drag a task onto another and they trade times. The task panel's "Cambiar con…" and "Intercambiar
// horario con…" do the same without dragging (keyboard, screen readers). Every swap shows at once, says what it
// did and offers Deshacer.

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, ArrowUpDown } from "lucide-react";

import { haptic } from "components/Admin/stage/haptics";
import { PersonAvatar } from "components/Admin/ui/person";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "components/shared/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { StaffSeat } from "lib/orpc/staff-tasks/schemas";
import { byDayAndTime, moveProblem, swapProblem, timesProblem } from "lib/orpc/staff-tasks/swap";

import { firstName, formatDayLabel, timeRange, type StaffTask } from "./helpers";
import { staffKeys, undoable, useOptimistic } from "./use-staff";

// ------------------------------------------------------------------ the cache, as the server will leave it

const personAt = (tasks: StaffTask[], seat: StaffSeat) =>
  tasks.find((task) => task.id === seat.taskId)?.assignees.find((person) => person.userId === seat.userId);

/** `a` and `b` trade tasks. */
export function withSeatsSwapped(tasks: StaffTask[], a: StaffSeat, b: StaffSeat): StaffTask[] {
  const first = personAt(tasks, a);
  const second = personAt(tasks, b);
  if (!first || !second) return tasks;
  const replace = (task: StaffTask, out: string, person: StaffTask["assignees"][number]) => ({
    ...task,
    assignees: task.assignees.map((assignee) => (assignee.userId === out ? { ...person, noShow: false } : assignee)),
  });

  return tasks.map((task) =>
    task.id === a.taskId
      ? replace(task, a.userId, second)
      : task.id === b.taskId
        ? replace(task, b.userId, first)
        : task
  );
}

/** Someone leaves `taskId` for `toTaskId`. */
export function withSeatMoved(
  tasks: StaffTask[],
  { taskId, userId, toTaskId }: { taskId: string; userId: string; toTaskId: string }
): StaffTask[] {
  const person = personAt(tasks, { taskId, userId });
  if (!person) return tasks;

  return tasks.map((task) =>
    task.id === taskId
      ? { ...task, assignees: task.assignees.filter((assignee) => assignee.userId !== userId) }
      : task.id === toTaskId
        ? { ...task, assignees: [...task.assignees, { ...person, noShow: false }] }
        : task
  );
}

/** Two tasks trade day, start and end, and the schedule re-sorts. */
export function withTimesSwapped(tasks: StaffTask[], xId: string, yId: string): StaffTask[] {
  const x = tasks.find((task) => task.id === xId);
  const y = tasks.find((task) => task.id === yId);
  if (!x || !y) return tasks;
  const times = ({ dayDate, startTime, endTime }: StaffTask) => ({ dayDate, startTime, endTime });

  return tasks
    .map((task) => (task.id === x.id ? { ...task, ...times(y) } : task.id === y.id ? { ...task, ...times(x) } : task))
    .toSorted(byDayAndTime);
}

// ------------------------------------------------------------------ the three swaps

type SwapActions = {
  /** Two people trade tasks. */
  people: (a: StaffSeat, b: StaffSeat) => void;
  /** Someone goes to another task. */
  move: (seat: StaffSeat, toTaskId: string) => void;
  /** Two tasks trade their times. */
  times: (taskId: string, otherTaskId: string) => void;
};

const nameAt = (task: StaffTask, userId: string) =>
  firstName(task.assignees.find((person) => person.userId === userId)?.name ?? "");
/** "las 14:00", or "el sáb 7 nov a las 14:00" for another day, or "sin hora". */
const at = (task: StaffTask, day: string) =>
  task.startTime
    ? `${task.dayDate === day ? "" : `el ${formatDayLabel(task.dayDate)} `}a las ${task.startTime}`
    : "sin hora";

function useSwapActions(eventId: string, tasks: StaffTask[]): SwapActions {
  const keys = staffKeys(eventId);
  const optimistic = useOptimistic();
  const people = useMutation(
    orpc.staffTasks.swapAssignees.mutationOptions(
      optimistic<StaffTask[], { a: StaffSeat; b: StaffSeat }>(
        keys.tasks,
        (current, { a, b }) => withSeatsSwapped(current, a, b),
        "No se pudo hacer el cambio",
        [keys.onShift]
      )
    )
  );
  const move = useMutation(
    orpc.staffTasks.moveAssignee.mutationOptions(
      optimistic<StaffTask[], { taskId: string; userId: string; toTaskId: string }>(
        keys.tasks,
        withSeatMoved,
        "No se pudo pasar a esa persona",
        [keys.onShift]
      )
    )
  );
  const times = useMutation(
    orpc.staffTasks.swapTimes.mutationOptions(
      optimistic<StaffTask[], { taskId: string; otherTaskId: string }>(
        keys.tasks,
        (current, input) => withTimesSwapped(current, input.taskId, input.otherTaskId),
        "No se pudo cambiar el horario",
        [keys.onShift]
      )
    )
  );

  const byId = (id: string) => tasks.find((task) => task.id === id);

  return {
    people: (a, b) => {
      const x = byId(a.taskId);
      const y = byId(b.taskId);
      if (!x || !y) return;
      const problem = swapProblem(x, a.userId, y, b.userId);
      if (problem) {
        toast.error("No se puede intercambiar", problem);
        return;
      }
      const [one, other] = [nameAt(x, a.userId), nameAt(y, b.userId)];
      people.mutate(
        { eventId, a, b },
        {
          onSuccess: () =>
            undoable(`Intercambiaste a ${one} y ${other}`, `${one} va a «${y.title}» y ${other} a «${x.title}».`, () =>
              people.mutate({
                eventId,
                a: { taskId: b.taskId, userId: a.userId },
                b: { taskId: a.taskId, userId: b.userId },
              })
            ),
        }
      );
    },
    move: (seat, toTaskId) => {
      const from = byId(seat.taskId);
      const to = byId(toTaskId);
      if (!from || !to) return;
      const problem = moveProblem(from, seat.userId, to);
      if (problem) {
        toast.error("No se puede pasar", problem);
        return;
      }
      const name = nameAt(from, seat.userId);
      move.mutate(
        { eventId, ...seat, toTaskId },
        {
          onSuccess: () =>
            undoable(`${name} pasó a «${to.title}»`, `Ya no está en «${from.title}».`, () =>
              move.mutate({ eventId, taskId: toTaskId, userId: seat.userId, toTaskId: seat.taskId })
            ),
        }
      );
    },
    times: (taskId, otherTaskId) => {
      const x = byId(taskId);
      const y = byId(otherTaskId);
      if (!x || !y) return;
      const problem = timesProblem(x, y);
      if (problem) {
        toast.error("No se puede intercambiar", problem);
        return;
      }
      times.mutate(
        { eventId, taskId, otherTaskId },
        {
          onSuccess: () =>
            undoable(
              "Intercambiaste los horarios",
              `«${x.title}» queda ${at(y, x.dayDate)} y «${y.title}» ${at(x, y.dayDate)}.`,
              () => times.mutate({ eventId, taskId, otherTaskId })
            ),
        }
      );
    },
  };
}

// ------------------------------------------------------------------ dragging

/** What's being dragged: a person on a task, or a task's time. */
type Dragged =
  | { kind: "seat"; seat: StaffSeat; name: string; image: string | null; label: string }
  | { kind: "times"; taskId: string; label: string };
/** Where it can land: on a person (they trade), on a task (the person moves there), on a task's time. */
type Target =
  | { kind: "seat"; seat: StaffSeat; label: string }
  | { kind: "task"; taskId: string; label: string }
  | { kind: "times"; taskId: string; label: string };

type SwapContextValue = { tasks: StaffTask[]; enabled: boolean; actions: SwapActions };
const SwapContext = React.createContext<SwapContextValue | null>(null);

function useSwapContext() {
  const context = React.useContext(SwapContext);
  if (!context) throw new Error("useSwapContext needs a SwapProvider");
  return context;
}

/** "self" for a drop back where it started (nothing happens), a Spanish reason, or null when it works. */
function verdict(tasks: StaffTask[], from: Dragged, to: Target): string | null | "self" {
  const task = (id: string) => tasks.find((candidate) => candidate.id === id);
  if (from.kind === "seat" && to.kind === "seat") {
    if (from.seat.taskId === to.seat.taskId) return "self";
    const [x, y] = [task(from.seat.taskId), task(to.seat.taskId)];
    return x && y ? swapProblem(x, from.seat.userId, y, to.seat.userId) : "self";
  }
  if (from.kind === "seat" && to.kind === "task") {
    if (from.seat.taskId === to.taskId) return "self";
    const [x, y] = [task(from.seat.taskId), task(to.taskId)];
    return x && y ? moveProblem(x, from.seat.userId, y) : "self";
  }
  if (from.kind === "times" && to.kind === "times") {
    if (from.taskId === to.taskId) return "self";
    const [x, y] = [task(from.taskId), task(to.taskId)];
    return x && y ? timesProblem(x, y) : "self";
  }

  return "self";
}

/** A person lands on the person under the finger before the task around them. */
const peopleFirst: CollisionDetection = (args) => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
  const person = hits.find(
    (hit) => (hit.data?.droppableContainer?.data.current as Target | undefined)?.kind === "seat"
  );

  return person ? [person] : hits;
};

/** The dragged pill sits next to the pointer, not at the corner of a wide row. */
const nextToPointer: Modifier = ({ activatorEvent, activeNodeRect, transform }) => {
  if (!activatorEvent || !activeNodeRect) return transform;
  const point =
    "touches" in activatorEvent ? (activatorEvent as TouchEvent).touches[0] : (activatorEvent as MouseEvent);
  if (!point) return transform;
  // On touch, above the finger, where it can be seen.
  const lift = "touches" in activatorEvent ? 56 : 14;

  return {
    ...transform,
    x: transform.x + point.clientX - activeNodeRect.left + 10,
    y: transform.y + point.clientY - activeNodeRect.top - lift,
  };
};

const labelOf = (item: { data: { current?: unknown } } | null) =>
  (item?.data.current as Dragged | Target | undefined)?.label ?? "";
const announcements: Announcements = {
  onDragStart: ({ active }) => `Levantaste a ${labelOf(active)}.`,
  onDragOver: ({ active, over }) => (over ? `${labelOf(active)}, sobre ${labelOf(over)}.` : `${labelOf(active)}.`),
  onDragEnd: ({ active, over }) =>
    over ? `Soltaste ${labelOf(active)} sobre ${labelOf(over)}.` : `${labelOf(active)} vuelve a su lugar.`,
  onDragCancel: ({ active }) => `${labelOf(active)} vuelve a su lugar.`,
};

/**
 * The swaps for one event's tasks, for everything under it. `enabled` is for editors: for everyone else nothing
 * drags. With a mouse a drag starts after a few pixels; on touch, after holding still a moment, so a finger that
 * moves right away is scrolling.
 */
export function SwapProvider({
  eventId,
  tasks,
  enabled,
  children,
}: {
  eventId: string;
  tasks: StaffTask[];
  enabled: boolean;
  children: React.ReactNode;
}) {
  const actions = useSwapActions(eventId, tasks);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );
  const [dragged, setDragged] = React.useState<Dragged | null>(null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const from = active.data.current as Dragged | undefined;
    const to = over?.data.current as Target | undefined;
    if (!from || !to) return;
    const result = verdict(tasks, from, to);
    if (result === "self") return;
    if (result !== null) {
      toast.error("No se puede", result);
      return;
    }
    haptic(10);
    if (from.kind === "seat" && to.kind === "seat") actions.people(from.seat, to.seat);
    else if (from.kind === "seat" && to.kind === "task") actions.move(from.seat, to.taskId);
    else if (from.kind === "times" && to.kind === "times") actions.times(from.taskId, to.taskId);
  };

  return (
    <SwapContext.Provider value={{ tasks, enabled, actions }}>
      <DndContext
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: "Para hacerlo sin arrastrar, abrí la tarea y usá «Cambiar con…» o «Intercambiar horario con…».",
          },
        }}
        collisionDetection={peopleFirst}
        sensors={sensors}
        onDragCancel={() => setDragged(null)}
        onDragEnd={onDragEnd}
        onDragStart={({ active }) => {
          haptic(8);
          setDragged((active.data.current as Dragged | undefined) ?? null);
        }}
      >
        {children}
        <DragOverlay dropAnimation={null} modifiers={[nextToPointer]} zIndex={60}>
          {dragged ? (
            <span className="inline-flex h-8 max-w-64 items-center gap-2 rounded-full border border-primary/50 bg-popover pr-3 pl-1 text-ui font-medium text-foreground shadow-overlay">
              {dragged.kind === "seat" ? (
                <PersonAvatar image={dragged.image} name={dragged.name} size={24} />
              ) : (
                <ArrowUpDown aria-hidden className="ml-1.5 size-3.5 text-primary" />
              )}
              <span className="truncate">{dragged.kind === "seat" ? dragged.name : dragged.label}</span>
            </span>
          ) : null}
        </DragOverlay>
      </DndContext>
    </SwapContext.Provider>
  );
}

/** How a drop target looks while something is dragged: a dashed outline where it can land, solid under it. */
export type DropState = "idle" | "candidate" | "over" | "refused";

export const DROP_OUTLINE: Record<DropState, string> = {
  idle: "",
  candidate: "outline-1 outline-offset-2 outline-primary/40 outline-dashed",
  over: "outline-2 outline-offset-2 outline-primary outline-solid",
  refused: "outline-2 outline-offset-2 outline-live/70 outline-solid",
};

/** The same inside a full-width list, where an outline outside the row would be cut off. */
export const DROP_INSET: Record<DropState, string> = {
  idle: "",
  candidate: "outline-1 -outline-offset-2 outline-primary/40 outline-dashed",
  over: "outline-2 -outline-offset-2 outline-primary outline-solid",
  refused: "outline-2 -outline-offset-2 outline-live/70 outline-solid",
};

/** A table row can't take an outline everywhere: its cells change colour instead. */
export const DROP_ROW: Record<DropState, string> = {
  idle: "",
  candidate: "[&>td]:bg-primary/[0.03]",
  over: "[&>td]:bg-primary/[0.12]",
  refused: "[&>td]:bg-live/[0.12]",
};

function useTarget(id: string, target: Target, disabled: boolean) {
  const { tasks } = useSwapContext();
  const { setNodeRef, isOver, active } = useDroppable({ id, data: target, disabled });
  const from = active?.data.current as Dragged | undefined;
  const result = from && !disabled ? verdict(tasks, from, target) : "self";
  const state: DropState =
    result === "self" ? "idle" : result !== null ? (isOver ? "refused" : "idle") : isOver ? "over" : "candidate";

  return { setNodeRef, state };
}

/** Where a drag starts: a long press there drags instead of selecting text or opening the context menu. */
export const DRAG_HANDLE = "touch-manipulation select-none [-webkit-touch-callout:none]";

/**
 * A finger that lands on something draggable is about to drag it, not to slide the row around it: the row's own
 * pan starts on that pointerdown, so it never hears it. (Drags listen to touchstart and mousedown.)
 */
const keepFromRow = (event: Event) => event.stopPropagation();

/** One ref for an element that is both dragged and dropped on. */
function useBoth(setDrag: (node: HTMLElement | null) => void, setDrop: (node: HTMLElement | null) => void) {
  return React.useCallback(
    (node: HTMLElement | null) => {
      setDrag(node);
      setDrop(node);
      node?.addEventListener("pointerdown", keepFromRow);
    },
    [setDrag, setDrop]
  );
}

/**
 * A person on a task (a chip on an Ahora card, a bar on Turnos): dragged onto another person they trade tasks,
 * onto another task they move there. `ref` and `listeners` go on the element (with DRAG_HANDLE when `draggable`);
 * `dragging` dims it while it's away, `drop` outlines it while something can land on it. A view drawn twice (a
 * timeline for desktop, a list for phones, one of them hidden) gives each copy its own `layout`: dnd-kit keeps one
 * element per id, and the hidden copy would take the visible one's place.
 */
export function useSeat(
  seat: StaffSeat,
  person: { name: string; image: string | null },
  taskTitle: string,
  layout = "card"
) {
  const { enabled } = useSwapContext();
  const id = `seat:${layout}:${seat.taskId}:${seat.userId}`;
  const label = `${person.name} en «${taskTitle}»`;
  const drag = useDraggable({
    id,
    data: { kind: "seat", seat, name: person.name, image: person.image, label } satisfies Dragged,
    disabled: !enabled,
  });
  const drop = useTarget(id, { kind: "seat", seat, label }, !enabled);

  return {
    ref: useBoth(drag.setNodeRef, drop.setNodeRef),
    listeners: enabled ? drag.listeners : undefined,
    draggable: enabled,
    dragging: drag.isDragging,
    drop: drop.state,
  };
}

/** A task (an Ahora card) a person can be dropped on, to move there. */
export function useTaskTarget(task: StaffTask) {
  const { enabled } = useSwapContext();
  return useTarget(`task:${task.id}`, { kind: "task", taskId: task.id, label: `«${task.title}»` }, !enabled);
}

/** A task's row on the Cronograma: dragged onto another task's row, the two trade times. `layout`: see useSeat. */
export function useTimes(task: StaffTask, layout: string) {
  const { enabled } = useSwapContext();
  const id = `times:${layout}:${task.id}`;
  const label = `«${task.title}» (${timeRange(task) ?? "sin hora"})`;
  const drag = useDraggable({
    id,
    data: { kind: "times", taskId: task.id, label } satisfies Dragged,
    disabled: !enabled,
  });
  const drop = useTarget(id, { kind: "times", taskId: task.id, label }, !enabled);

  return {
    ref: useBoth(drag.setNodeRef, drop.setNodeRef),
    listeners: enabled ? drag.listeners : undefined,
    draggable: enabled,
    dragging: drag.isDragging,
    drop: drop.state,
  };
}

// ------------------------------------------------------------------ the same, from menus

const whenOf = (task: StaffTask, day: string) =>
  [task.dayDate === day ? null : formatDayLabel(task.dayDate), timeRange(task) ?? "Sin hora"]
    .filter(Boolean)
    .join(" · ");

function SwapMenu({
  open,
  onOpenChange,
  trigger,
  placeholder,
  empty,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  placeholder: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          {/* As tall as the room on its side, minus the search box: flipped above its trigger on a phone, it
              stays on screen. */}
          <CommandList className="max-h-[min(20rem,calc(var(--radix-popover-content-available-height,24rem)_-_3.5rem))]">
            <CommandEmpty>{empty}</CommandEmpty>
            {children}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * "Cambiar con…": who `seat` trades places with, or which task they just move to. `onDone` runs once it's sent:
 * the task panel closes then, since a toast's Deshacer can't be pressed under an open panel.
 */
export function SeatSwapMenu({
  seat,
  trigger,
  onDone,
}: {
  seat: StaffSeat;
  trigger: React.ReactNode;
  onDone?: () => void;
}) {
  const { tasks, actions } = useSwapContext();
  const [open, setOpen] = React.useState(false);
  const from = tasks.find((task) => task.id === seat.taskId);
  if (!from) return null;
  const others = tasks.filter((task) => moveProblem(from, seat.userId, task) === null);
  const run = (action: () => void) => {
    setOpen(false);
    action();
    onDone?.();
  };

  return (
    <SwapMenu
      empty="No hay otra tarea para este cambio."
      open={open}
      placeholder="Buscar tarea o persona…"
      trigger={trigger}
      onOpenChange={setOpen}
    >
      {others.map((task) => (
        <CommandGroup key={task.id} heading={`${whenOf(task, from.dayDate)} · ${task.title}`}>
          {task.assignees
            .filter((person) => swapProblem(from, seat.userId, task, person.userId) === null)
            .map((person) => (
              <CommandItem
                key={person.userId}
                keywords={[task.title]}
                value={`${task.id}:${person.userId} ${person.name}`}
                onSelect={() => run(() => actions.people(seat, { taskId: task.id, userId: person.userId }))}
              >
                <ArrowLeftRight aria-hidden className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">Cambiar con {person.name}</span>
              </CommandItem>
            ))}
          <CommandItem
            keywords={[task.title]}
            value={`${task.id} pasar`}
            onSelect={() => run(() => actions.move(seat, task.id))}
          >
            <ArrowRight aria-hidden className="text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">Pasar a esta tarea</span>
          </CommandItem>
        </CommandGroup>
      ))}
    </SwapMenu>
  );
}

/** "Intercambiar horario con…": the task `task` trades day, start and end with. `onDone`: see SeatSwapMenu. */
export function TimesSwapMenu({
  task,
  trigger,
  onDone,
}: {
  task: StaffTask;
  trigger: React.ReactNode;
  onDone?: () => void;
}) {
  const { tasks, actions } = useSwapContext();
  const [open, setOpen] = React.useState(false);
  const others = tasks.filter((other) => timesProblem(task, other) === null);
  const days = [...new Set(others.map((other) => other.dayDate))];

  return (
    <SwapMenu
      empty="No hay otra tarea con la que intercambiar."
      open={open}
      placeholder="Buscar tarea…"
      trigger={trigger}
      onOpenChange={setOpen}
    >
      {days.map((day) => (
        <CommandGroup key={day} heading={days.length > 1 || day !== task.dayDate ? formatDayLabel(day) : undefined}>
          {others
            .filter((other) => other.dayDate === day)
            .map((other) => (
              <CommandItem
                key={other.id}
                value={`${other.id} ${other.title}`}
                onSelect={() => {
                  setOpen(false);
                  actions.times(task.id, other.id);
                  onDone?.();
                }}
              >
                <span className="w-[5.5rem] shrink-0 font-terminal text-meta text-muted-foreground tabular-nums">
                  {timeRange(other) ?? "Sin hora"}
                </span>
                <span className="min-w-0 flex-1 truncate">{other.title}</span>
              </CommandItem>
            ))}
        </CommandGroup>
      ))}
    </SwapMenu>
  );
}
