// Client-safe helpers for the staff tasks page. Types come from the schemas
// module directly — the staff-tasks barrel also exports services, which pull
// `server-only` through publishServer.
import type { StaffAnnouncement, StaffTask } from "lib/orpc/staff-tasks/schemas";

export type { StaffAnnouncement, StaffTask };

export type StaffTaskStatus = StaffTask["status"];
export type StaffTaskType = StaffTask["type"];

export interface RosterMember {
  id: string;
  userId: string;
  role: string;
  name: string;
  email: string;
  image: string | null;
}

export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const formatClock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

/** Local "YYYY-MM-DD" — the event day in the user's timezone. */
export const todayDayString = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/** "2025-11-08" → "sáb 8 nov" */
export const formatDayLabel = (day: string): string => {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short" }).format(date);
};

export const relativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
};

/** Default duration when a task has no endTime, for the "En curso" lane. */
export const DEFAULT_TASK_MINUTES = 45;

export const STATUS_META: Record<StaffTaskStatus, { label: string; dot: string }> = {
  pending: { label: "Pendiente", dot: "bg-muted-foreground" },
  in_progress: { label: "En curso", dot: "bg-primary" },
  done: { label: "Lista", dot: "bg-emerald-500" },
  blocked: { label: "Bloqueada", dot: "bg-destructive" },
};

export const TYPE_META: Record<StaffTaskType, { label: string }> = {
  task: { label: "Tarea" },
  ongoing: { label: "Continuo" },
  milestone: { label: "Agenda" },
};

export const isUnderstaffed = (task: StaffTask): boolean =>
  task.type !== "milestone" && task.minPeople != null && task.assignees.length < task.minPeople;

export const isMine = (task: StaffTask, meId: string): boolean =>
  task.assignees.some((assignee) => assignee.userId === meId);

/** Active window of a timed task, in minutes-of-day. */
export const taskWindow = (task: StaffTask): { start: number; end: number } | null => {
  if (!task.startTime) return null;
  const start = timeToMinutes(task.startTime);
  const end = task.endTime ? timeToMinutes(task.endTime) : start + DEFAULT_TASK_MINUTES;
  return { start, end: Math.max(end, start + 5) };
};

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
