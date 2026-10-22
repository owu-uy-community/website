// Client-safe helpers for Staff y tareas and Mi turno.
import type { BadgeProps } from "components/shared/ui/badge";
import type { OnShift, StaffAnnouncement, StaffArrival, StaffMember, StaffTask } from "lib/orpc/staff-tasks/schemas";
import { isLateFor, toMinutes, type TaskPhase } from "lib/orpc/staff-tasks/shift";
import { wallClock } from "lib/slot-day";

export type { OnShift, StaffAnnouncement, StaffArrival, StaffTask, TaskPhase };
export type RosterMember = StaffMember;
export type StaffTaskStatus = StaffTask["status"];
export type StaffTaskType = StaffTask["type"];
export type Assignee = StaffTask["assignees"][number];

/** The tabs of Staff y tareas, as `?tab=` says them. */
export const TAREAS_TABS = ["ahora", "cronograma", "turnos", "anuncios"] as const;
export type TareasTab = (typeof TAREAS_TABS)[number];

const dayParts = new Intl.DateTimeFormat("es-UY", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2026-11-07" → "sáb 7 nov", the same on every browser and on the server. */
export const formatDayLabel = (day: string): string => {
  const parts = Object.fromEntries(
    dayParts.formatToParts(new Date(`${day}T12:00:00.000Z`)).map((part) => [part.type, part.value.replace(".", "")])
  );
  return `${parts.weekday} ${parts.day} ${parts.month}`;
};

/** Today, the minute of the day and "HH:MM" on the event's wall clock. */
export const eventClock = (at: number, timeZone: string) => {
  const clock = wallClock(new Date(at), timeZone);
  return { today: clock.slice(0, 10), nowMin: toMinutes(clock.slice(11)), time: clock.slice(11) };
};

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "16:00–18:30", "19:00", or null for an untimed task. */
export const timeRange = (task: Pick<StaffTask, "startTime" | "endTime">) =>
  task.startTime ? (task.endTime ? `${task.startTime}–${task.endTime}` : task.startTime) : null;

export const isMine = (task: StaffTask, meId: string): boolean =>
  task.assignees.some((assignee) => assignee.userId === meId);

/** How many more people the task needs to reach its minimum; whoever was marked absent doesn't count. */
export const missingPeople = (task: StaffTask): number =>
  task.type !== "milestone" && task.minPeople != null
    ? Math.max(0, task.minPeople - task.assignees.filter((assignee) => !assignee.noShow).length)
    : 0;

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** How a task's phase reads as a badge. */
export function phaseBadge(task: StaffTask, phase: TaskPhase): { label: string; variant: BadgeVariant } {
  switch (phase) {
    case "done":
      return { label: "Lista", variant: "success" };
    case "blocked":
      return { label: "Bloqueada", variant: "destructive" };
    case "overdue":
      return { label: "Atrasada", variant: "destructive" };
    case "ongoing":
      return { label: "Continua", variant: "info" };
    case "now":
      return { label: task.status === "in_progress" ? "En curso" : "Ahora", variant: "default" };
    default:
      return { label: "Pendiente", variant: "secondary" };
  }
}

export type AssigneeState = "noshow" | "late" | "here" | "left" | "unknown";

/** Where someone on a task stands at minute `at` of its day; arrivals only mean something today. */
export function assigneeState(
  task: StaffTask,
  assignee: Assignee,
  arrival: StaffArrival | undefined,
  at: number,
  isToday: boolean
): AssigneeState {
  if (assignee.noShow) return "noshow";
  if (!isToday) return "unknown";
  if (arrival?.leftAt) return "left";
  if (arrival) return "here";

  return isLateFor(task, assignee, false, at) ? "late" : "unknown";
}

/** "llegó 13:42", "no llegó"…: one person's state, said briefly. */
export function assigneeNote(state: AssigneeState, arrival: StaffArrival | undefined, timeZone: string) {
  const at = (iso: string) => wallClock(new Date(iso), timeZone).slice(11);
  switch (state) {
    case "noshow":
      return "no vino";
    case "late":
      return "no llegó";
    case "left":
      return arrival?.leftAt ? `se fue ${at(arrival.leftAt)}` : "se fue";
    case "here":
      return arrival ? `llegó ${at(arrival.arrivedAt)}` : "llegó";
    default:
      return null;
  }
}
