// Where the staff stands at a given minute: pure, shared by the server's on-shift summary and
// the page's timeline, so both always tell the same story.
import type { OnShift, ShiftState, StaffArrival, StaffTask } from "./schemas";

/** A task with no end time is planned as this long. */
export const DEFAULT_TASK_MINUTES = 45;
/** Someone is late once their task has been running this long without them at the venue. */
export const LATE_AFTER_MINUTES = 5;
const DAY_MINUTES = 24 * 60;

export const toMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** A timed task's window in minutes of its day; untimed tasks have none. */
export const taskWindow = (task: Pick<StaffTask, "startTime" | "endTime">): { start: number; end: number } | null => {
  if (!task.startTime) return null;
  const start = toMinutes(task.startTime);
  const end = task.endTime ? toMinutes(task.endTime) : start + DEFAULT_TASK_MINUTES;
  return { start, end: Math.max(end, start + 5) };
};

/** The minute of `day` it is: a past day is over, a future one hasn't started. */
export const minuteOfDay = (day: string, today: string, nowMin: number): number =>
  day < today ? DAY_MINUTES : day > today ? -1 : nowMin;

export type TaskPhase = "done" | "blocked" | "ongoing" | "now" | "overdue" | "upcoming";

type PhaseTask = Pick<StaffTask, "type" | "status" | "startTime" | "endTime">;

/** Where a (non-milestone) task stands at minute `at` of its day. */
export const taskPhase = (task: PhaseTask, at: number): TaskPhase => {
  if (task.status === "done") return "done";
  if (task.status === "blocked") return "blocked";
  if (task.type === "ongoing") return "ongoing";
  if (task.status === "in_progress") return "now";
  const window = taskWindow(task);
  if (!window || at < window.start) return "upcoming";

  return at < window.end ? "now" : "overdue";
};

/** Someone on it right now: started, or within its time, and not finished. */
const isOn = (task: PhaseTask, at: number) => {
  if (task.status === "done" || task.type === "milestone") return false;
  const window = taskWindow(task);

  return task.status === "in_progress" || (window !== null && window.start <= at && at < window.end);
};

/** Late: their task has been running a while, they aren't at the venue and nobody marked them absent. */
export const isLateFor = (
  task: PhaseTask,
  assignee: Pick<StaffTask["assignees"][number], "noShow">,
  arrived: boolean,
  at: number
): boolean => {
  if (arrived || assignee.noShow || task.status === "done" || task.type === "milestone") return false;
  const window = taskWindow(task);

  return window !== null && window.start + LATE_AFTER_MINUTES <= at && at < window.end;
};

/**
 * Today's staff at minute `nowMin` of `day`: who is busy, free, late, not here yet or gone.
 * Expected are the people with a task today (not marked absent) plus anyone who came.
 */
export function summarizeShift({
  tasks,
  arrivals,
  day,
  nowMin,
}: {
  tasks: StaffTask[];
  arrivals: StaffArrival[];
  day: string;
  nowMin: number;
}): OnShift {
  const today = tasks.filter((task) => task.dayDate === day && task.type !== "milestone");
  const arrivalOf = new Map(arrivals.map((arrival) => [arrival.userId, arrival]));
  const people = new Map<string, { userId: string; name: string; image: string | null }>();
  for (const { userId, name, image } of arrivals) people.set(userId, { userId, name, image });
  for (const task of today) {
    for (const { userId, name, image, noShow } of task.assignees)
      if (!noShow) people.set(userId, { userId, name, image });
  }

  const rows = [...people.values()]
    .map((person) => {
      const arrival = arrivalOf.get(person.userId);
      const assigned = today.flatMap((task) => {
        const assignee = task.assignees.find((candidate) => candidate.userId === person.userId && !candidate.noShow);
        return assignee ? [{ task, assignee }] : [];
      });
      const on = assigned.filter(({ task }) => isOn(task, nowMin));
      const late = assigned.filter(({ task, assignee }) => isLateFor(task, assignee, Boolean(arrival), nowMin));
      const state: ShiftState = arrival?.leftAt
        ? "left"
        : arrival
          ? on.length > 0
            ? "busy"
            : "free"
          : late.length > 0
            ? "late"
            : "away";

      return {
        ...person,
        state,
        arrivedAt: arrival?.arrivedAt ?? null,
        leftAt: arrival?.leftAt ?? null,
        taskIds: (state === "late" ? late : state === "busy" ? on : []).map(({ task }) => task.id),
      };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name, "es"));
  const count = (state: ShiftState) => rows.filter((row) => row.state === state).length;

  return {
    day,
    time: toTime(Math.max(0, Math.min(DAY_MINUTES - 1, nowMin))),
    expected: rows.length,
    onSite: count("busy") + count("free"),
    late: count("late"),
    free: count("free"),
    people: rows,
  };
}
