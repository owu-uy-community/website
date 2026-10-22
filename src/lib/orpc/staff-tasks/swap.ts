// Two people trading places, one person moving to another task, two tasks trading their times: what can't be
// done, and why. Pure, so the API and the screens dragging things around always agree.
import type { StaffTask } from "./schemas";

type PeopleTask = Pick<StaffTask, "id" | "title" | "type" | "assignees">;
type TimedTask = Pick<StaffTask, "id" | "type" | "dayDate" | "startTime" | "endTime">;

/** The schedule's order: by day and time, untimed tasks last in their day. A swap of times re-sorts by it. */
export const byDayAndTime = (
  a: Pick<StaffTask, "dayDate" | "startTime" | "sortOrder" | "createdAt">,
  b: Pick<StaffTask, "dayDate" | "startTime" | "sortOrder" | "createdAt">
) =>
  a.dayDate.localeCompare(b.dayDate) ||
  (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") ||
  a.sortOrder - b.sortOrder ||
  a.createdAt.localeCompare(b.createdAt);

const isOn = (task: PeopleTask, userId: string) => task.assignees.some((person) => person.userId === userId);
const nameOn = (task: PeopleTask, userId: string) =>
  task.assignees.find((person) => person.userId === userId)?.name ?? null;

/** Why `a` (on `x`) and `b` (on `y`) can't trade places, or null when they can. */
export function swapProblem(x: PeopleTask, a: string, y: PeopleTask, b: string): string | null {
  if (x.id === y.id) return "Están en la misma tarea: no hay nada que intercambiar";
  const first = nameOn(x, a);
  const second = nameOn(y, b);
  if (!first) return `Esa persona ya no está en «${x.title}»`;
  if (!second) return `Esa persona ya no está en «${y.title}»`;
  if (isOn(y, a)) return `${first} ya está en «${y.title}»`;
  if (isOn(x, b)) return `${second} ya está en «${x.title}»`;

  return null;
}

/** Why `userId` can't go from `from` to `to`, or null when they can. */
export function moveProblem(from: PeopleTask, userId: string, to: PeopleTask): string | null {
  if (from.id === to.id) return "Ya está en esa tarea";
  const name = nameOn(from, userId);
  if (!name) return `Esa persona ya no está en «${from.title}»`;
  if (to.type === "milestone") return "Un hito no lleva personas";
  if (isOn(to, userId)) return `${name} ya está en «${to.title}»`;

  return null;
}

/** Why `x` and `y` can't trade their day and times, or null when they can. */
export function timesProblem(x: TimedTask, y: TimedTask): string | null {
  if (x.id === y.id) return "Es la misma tarea";
  if ((x.type === "milestone") !== (y.type === "milestone")) return "Un hito solo cambia de horario con otro hito";
  if (x.dayDate === y.dayDate && x.startTime === y.startTime && x.endTime === y.endTime) {
    return "Las dos tienen el mismo horario";
  }

  return null;
}
