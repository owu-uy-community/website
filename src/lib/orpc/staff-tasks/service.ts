import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { Effect } from "effect";
import type * as z from "zod";

import {
  account,
  communities,
  communityMembers,
  events,
  staffAnnouncementAcks,
  staffAnnouncements,
  staffArrivals,
  staffTaskAssignments,
  staffTasks,
  user,
  type StaffTaskRow,
} from "../../db/schema";
import { owyChannels, sendSlackDm } from "../../owy/messaging";
import { eventChannel } from "../../realtime/channels";
import { wallClock } from "../../slot-day";
import { query, transaction } from "../db";
import { Forbidden, Invalid, NotFound, UpstreamFailed } from "../errors";
import { opsPing, recordActivity } from "../ops";
import { memberRole, ROLE_RANK } from "../scope";
import { CommunityScope, CurrentUser, Realtime } from "../services";
import type {
  AckStaffAnnouncementSchema,
  AssignStaffTaskSchema,
  CreateStaffAnnouncementSchema,
  CreateStaffTaskSchema,
  ImportRow,
  ImportStaffTasksSchema,
  JoinStaffTaskSchema,
  SetNoShowSchema,
  SetStaffTaskStatusSchema,
  ShiftStaffTasksSchema,
  StaffAnnouncement,
  StaffArrival,
  StaffArrivalInputSchema,
  StaffMember,
  StaffTask,
  MoveAssigneeSchema,
  SwapAssigneesSchema,
  SwapTimesSchema,
  UpdateStaffTaskSchema,
} from "./schemas";
import { parseSheet, taskKey } from "./sheet";
import { summarizeShift, toMinutes } from "./shift";
import { byDayAndTime, moveProblem, swapProblem, timesProblem } from "./swap";

type CreateInput = z.infer<typeof CreateStaffTaskSchema>;
type UpdateInput = z.infer<typeof UpdateStaffTaskSchema>;
type TaskRef = z.infer<typeof JoinStaffTaskSchema>;
type SetStatusInput = z.infer<typeof SetStaffTaskStatusSchema>;
type AssignInput = z.infer<typeof AssignStaffTaskSchema>;
type ShiftInput = z.infer<typeof ShiftStaffTasksSchema>;
type CreateAnnouncementInput = z.infer<typeof CreateStaffAnnouncementSchema>;
type AckInput = z.infer<typeof AckStaffAnnouncementSchema>;
type ArrivalInput = z.infer<typeof StaffArrivalInputSchema>;
type NoShowInput = z.infer<typeof SetNoShowSchema>;
type ImportInput = z.infer<typeof ImportStaffTasksSchema>;
type SwapInput = z.infer<typeof SwapAssigneesSchema>;
type MoveInput = z.infer<typeof MoveAssigneeSchema>;
type SwapTimesInput = z.infer<typeof SwapTimesSchema>;

/** dayDate is a date-only value stored as UTC midnight, transported "YYYY-MM-DD". */
const toDayString = (date: Date): string => date.toISOString().slice(0, 10);
const fromDayString = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/** Move an "HH:MM" by some minutes, clamped to the same day rather than wrapping into the next. */
const shiftTime = (time: string, deltaMinutes: number): string => {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + deltaMinutes));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** «Title» as the activity log quotes it. */
const clip = (text: string) => (text.length > 60 ? `${text.slice(0, 59)}…` : text);
const quoted = (text: string) => `«${clip(text)}»`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The staff channel is publicly subscribable (the hub only gates `private:*`),
 * so broadcasts are content-free pings — data always flows through guarded
 * reads. Sent after the write commits, so a screen that refetches sees it.
 */
const ping = (eventId: string, event: "tasks_changed" | "announcement_created", payload: object = {}) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(eventChannel(eventId, "staff"), event, payload);
  });

const person = { columns: { id: true, name: true, image: true } } as const;

/** A task's people in the order they were put on it, so lists don't reshuffle when one of them changes. */
const assignments = {
  with: { user: person },
  orderBy: [asc(staffTaskAssignments.createdAt), asc(staffTaskAssignments.id)],
};

type TaskWithAssignments = StaffTaskRow & {
  assignments: { noShow: boolean; user: { id: string; name: string; image: string | null } }[];
};

const toTask = (row: TaskWithAssignments): StaffTask => ({
  id: row.id,
  openSpaceId: row.openSpaceId,
  title: row.title,
  notes: row.notes,
  type: row.type,
  dayDate: toDayString(row.dayDate),
  startTime: row.startTime,
  endTime: row.endTime,
  minPeople: row.minPeople,
  location: row.location,
  status: row.status,
  statusUpdatedById: row.statusUpdatedById,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  assignees: row.assignments.map((a) => ({
    userId: a.user.id,
    name: a.user.name,
    image: a.user.image,
    noShow: a.noShow,
  })),
});

const taskNotFound = new NotFound({ entity: "task", message: "Esa tarea no es de este evento" });
const announcementNotFound = new NotFound({ entity: "announcement", message: "Ese aviso no es de este evento" });

/** A task with its people — only if it belongs to the event the caller was let into. */
const taskInEvent = (taskId: string, eventId: string) =>
  query((db) =>
    db.query.staffTasks.findFirst({
      where: and(eq(staffTasks.id, taskId), eq(staffTasks.openSpaceId, eventId)),
      with: { assignments },
    })
  ).pipe(Effect.flatMap((row) => (row ? Effect.succeed(toTask(row)) : Effect.fail(taskNotFound))));

/** The community's staff, by name. No contact details: every member sees this list. */
const staffOf = (communityId: string) =>
  query((db) =>
    db
      .select({
        id: communityMembers.id,
        communityId: communityMembers.communityId,
        userId: communityMembers.userId,
        role: communityMembers.role,
        name: user.name,
        image: user.image,
        createdAt: communityMembers.createdAt,
      })
      .from(communityMembers)
      .innerJoin(user, eq(user.id, communityMembers.userId))
      .where(eq(communityMembers.communityId, communityId))
      .orderBy(asc(user.name))
  ).pipe(Effect.map((rows) => rows.map((row): StaffMember => ({ ...row, createdAt: row.createdAt.toISOString() }))));

const notStaff = new Invalid({ message: "Solo se puede asignar a gente del staff de la comunidad" });

/** Only people on the community's staff can be put on a task. */
const ensureStaff = (userIds: readonly string[]) =>
  Effect.gen(function* () {
    const wanted = new Set(userIds);
    if (wanted.size === 0) return;
    const { communityId } = yield* CommunityScope;
    const found = yield* query((db) =>
      db
        .select({ userId: communityMembers.userId })
        .from(communityMembers)
        .where(and(eq(communityMembers.communityId, communityId), inArray(communityMembers.userId, [...wanted])))
    );
    if (found.length < wanted.size) return yield* notStaff;
  });

/** Acting on someone else's behalf (their arrival) takes an editor of the community, or site staff. */
const ensureEditor = (message: string) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    if (me.role === "admin") return;
    const { communityId } = yield* CommunityScope;
    const role = yield* memberRole(communityId, me.id);
    if (!role || ROLE_RANK[role] < ROLE_RANK.editor) return yield* new Forbidden({ message });
  });

/** Puts people on a task in the order given: a millisecond apart, so it's the order the task lists them in. */
const assign = (taskId: string, userIds: readonly string[]) => {
  const now = Date.now();

  return userIds.length === 0
    ? Effect.void
    : query((db) =>
        db
          .insert(staffTaskAssignments)
          .values(userIds.map((userId, index) => ({ taskId, userId, createdAt: new Date(now + index) })))
          .onConflictDoNothing()
      );
};

const logTask = (task: { id: string; openSpaceId: string }, verb: string, summary: string) =>
  recordActivity({ eventId: task.openSpaceId, verb, entityType: "task", entityId: task.id, summary });

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const listTasks = (eventId: string) =>
  query((db) =>
    db.query.staffTasks.findMany({
      where: eq(staffTasks.openSpaceId, eventId),
      with: { assignments },
    })
  ).pipe(Effect.map((rows) => rows.map(toTask).toSorted(byDayAndTime)));

/** A task and its first assignees, both or neither. */
export const createTask = (input: CreateInput) =>
  Effect.gen(function* () {
    const id = yield* transaction(
      Effect.gen(function* () {
        yield* ensureStaff(input.assigneeIds ?? []);
        const [task] = yield* query((db) =>
          db
            .insert(staffTasks)
            .values({
              openSpaceId: input.eventId,
              title: input.title,
              notes: input.notes ?? null,
              type: input.type,
              dayDate: fromDayString(input.dayDate),
              startTime: input.startTime ?? null,
              endTime: input.endTime ?? null,
              minPeople: input.minPeople ?? null,
              location: input.location ?? null,
              sortOrder: input.sortOrder ?? 0,
            })
            .returning({ id: staffTasks.id, openSpaceId: staffTasks.openSpaceId })
        );
        yield* assign(task.id, input.assigneeIds ?? []);
        yield* logTask(task, "task.created", `agregó la tarea ${quoted(input.title)}`);

        return task.id;
      })
    );
    yield* ping(input.eventId, "tasks_changed");

    return yield* taskInEvent(id, input.eventId);
  });

/** Patch the fields sent; `assigneeIds` replaces the whole set. People already on the task may stay. */
export const updateTask = ({ eventId, taskId, data }: UpdateInput) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const task = yield* taskInEvent(taskId, eventId);

        const patch: Partial<typeof staffTasks.$inferInsert> = {};
        if (data.title !== undefined) patch.title = data.title;
        if (data.notes !== undefined) patch.notes = data.notes ?? null;
        if (data.type !== undefined) patch.type = data.type;
        if (data.dayDate !== undefined) patch.dayDate = fromDayString(data.dayDate);
        if (data.startTime !== undefined) patch.startTime = data.startTime ?? null;
        if (data.endTime !== undefined) patch.endTime = data.endTime ?? null;
        if (data.minPeople !== undefined) patch.minPeople = data.minPeople ?? null;
        if (data.location !== undefined) patch.location = data.location ?? null;
        if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
        if (Object.keys(patch).length > 0) {
          yield* query((db) => db.update(staffTasks).set(patch).where(eq(staffTasks.id, taskId)));
        }

        if (data.assigneeIds !== undefined) {
          const wanted = new Set(data.assigneeIds);
          const current = new Set(task.assignees.map((assignee) => assignee.userId));
          yield* ensureStaff(data.assigneeIds.filter((id) => !current.has(id)));
          // Only the people taken off are removed, so whoever stays keeps their "no vino" mark.
          const removed = [...current].filter((id) => !wanted.has(id));
          if (removed.length > 0) {
            yield* query((db) =>
              db
                .delete(staffTaskAssignments)
                .where(and(eq(staffTaskAssignments.taskId, taskId), inArray(staffTaskAssignments.userId, removed)))
            );
          }
          yield* assign(taskId, data.assigneeIds);
        }
        yield* logTask(task, "task.updated", `editó la tarea ${quoted(data.title ?? task.title)}`);
      })
    );
    yield* ping(eventId, "tasks_changed");

    return yield* taskInEvent(taskId, eventId);
  });

export const deleteTask = ({ eventId, taskId }: TaskRef) =>
  Effect.gen(function* () {
    const task = yield* transaction(
      Effect.gen(function* () {
        const task = yield* taskInEvent(taskId, eventId);
        yield* query((db) => db.delete(staffTasks).where(eq(staffTasks.id, taskId)));
        yield* logTask(task, "task.deleted", `borró la tarea ${quoted(task.title)}`);
        return task;
      })
    );
    yield* ping(eventId, "tasks_changed");

    return task;
  });

const STATUS_SUMMARY: Record<StaffTask["status"], (title: string) => string> = {
  pending: (title) => `reabrió ${title}`,
  in_progress: (title) => `empezó ${title}`,
  done: (title) => `marcó ${title} como lista`,
  blocked: (title) => `marcó ${title} como bloqueada`,
};

export const setStatus = ({ eventId, taskId, status }: SetStatusInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    yield* transaction(
      Effect.gen(function* () {
        const [task] = yield* query((db) =>
          db
            .update(staffTasks)
            .set({ status, statusUpdatedById: me.id })
            .where(and(eq(staffTasks.id, taskId), eq(staffTasks.openSpaceId, eventId)))
            .returning({ id: staffTasks.id, openSpaceId: staffTasks.openSpaceId, title: staffTasks.title })
        );
        if (!task) return yield* taskNotFound;
        yield* logTask(task, `task.${status}`, STATUS_SUMMARY[status](quoted(task.title)));
      })
    );
    yield* ping(eventId, "tasks_changed");

    return yield* taskInEvent(taskId, eventId);
  });

const addAssignee = (
  { eventId, taskId }: TaskRef,
  userId: string,
  verb: string,
  summary: (name: string, title: string) => string
) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        yield* taskInEvent(taskId, eventId);
        yield* assign(taskId, [userId]);
        const task = yield* taskInEvent(taskId, eventId);
        const name = task.assignees.find((assignee) => assignee.userId === userId)?.name ?? "";
        yield* logTask(task, verb, summary(name, quoted(task.title)));
      })
    );
    yield* ping(eventId, "tasks_changed");

    return yield* taskInEvent(taskId, eventId);
  });

const removeAssignee = (
  { eventId, taskId }: TaskRef,
  userId: string,
  verb: string,
  summary: (name: string, title: string) => string
) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const task = yield* taskInEvent(taskId, eventId);
        const removed = yield* query((db) =>
          db
            .delete(staffTaskAssignments)
            .where(and(eq(staffTaskAssignments.taskId, taskId), eq(staffTaskAssignments.userId, userId)))
            .returning({ id: staffTaskAssignments.id })
        );
        const name = task.assignees.find((assignee) => assignee.userId === userId)?.name ?? "";
        if (removed.length > 0) yield* logTask(task, verb, summary(name, quoted(task.title)));
      })
    );
    yield* ping(eventId, "tasks_changed");

    return yield* taskInEvent(taskId, eventId);
  });

export const join = (input: TaskRef) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    return yield* addAssignee(input, me.id, "task.joined", (_, title) => `se sumó a ${title}`);
  });

export const leave = (input: TaskRef) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    return yield* removeAssignee(input, me.id, "task.left", (_, title) => `se bajó de ${title}`);
  });

/** An editor puts a staff member on a task. */
export const assignTo = (input: AssignInput) =>
  Effect.gen(function* () {
    yield* ensureStaff([input.userId]);
    return yield* addAssignee(input, input.userId, "task.assigned", (name, title) => `sumó a ${name} a ${title}`);
  });

export const unassign = (input: AssignInput) =>
  removeAssignee(input, input.userId, "task.unassigned", (name, title) => `sacó a ${name} de ${title}`);

/** An editor marks someone absent for one task (or takes the mark back). */
export const setNoShow = ({ eventId, taskId, userId, noShow }: NoShowInput) =>
  Effect.gen(function* () {
    const changed = yield* transaction(
      Effect.gen(function* () {
        const task = yield* taskInEvent(taskId, eventId);
        const assignee = task.assignees.find((candidate) => candidate.userId === userId);
        if (!assignee) {
          return yield* new NotFound({ entity: "assignment", message: "Esa persona no está en esta tarea" });
        }
        if (assignee.noShow === noShow) return false;
        yield* query((db) =>
          db
            .update(staffTaskAssignments)
            .set({ noShow })
            .where(and(eq(staffTaskAssignments.taskId, taskId), eq(staffTaskAssignments.userId, userId)))
        );
        yield* logTask(
          task,
          noShow ? "task.no_show" : "task.showed_up",
          noShow
            ? `marcó que ${assignee.name} no vino a ${quoted(task.title)}`
            : `quitó la ausencia de ${assignee.name} en ${quoted(task.title)}`
        );
        return true;
      })
    );
    if (changed) {
      yield* ping(eventId, "tasks_changed");
      yield* opsPing(eventId, "arrivals");
    }

    return yield* taskInEvent(taskId, eventId);
  });

// ---------------------------------------------------------------------------
// Swaps: people trading places, someone moving to another task, two tasks trading times
// ---------------------------------------------------------------------------

/**
 * Two of the event's tasks with their people, read under a lock: a swap reads both and writes both, so two
 * swaps on the same tasks wait for each other. Locked in id order, so they can't deadlock either.
 */
const lockTwo = (eventId: string, ids: [string, string]) =>
  Effect.gen(function* () {
    yield* query((db) =>
      db
        .select({ id: staffTasks.id })
        .from(staffTasks)
        .where(and(eq(staffTasks.openSpaceId, eventId), inArray(staffTasks.id, ids)))
        .orderBy(asc(staffTasks.id))
        .for("update")
    );

    return [yield* taskInEvent(ids[0], eventId), yield* taskInEvent(ids[1], eventId)] as const;
  });

const refuse = (problem: string | null) => (problem ? Effect.fail(new Invalid({ message: problem })) : Effect.void);

/**
 * Moves a person's seat to another task, at `placed` in its order (now: last). A "no vino" belonged to the seat
 * they left.
 */
const moveSeat = (fromTaskId: string, userId: string, toTaskId: string, placed = new Date()) =>
  query((db) =>
    db
      .update(staffTaskAssignments)
      .set({ taskId: toTaskId, noShow: false, createdAt: placed })
      .where(and(eq(staffTaskAssignments.taskId, fromTaskId), eq(staffTaskAssignments.userId, userId)))
  );

/** When a seat was taken: where it sits in its task's order. */
const placedAt = (taskId: string, userId: string) =>
  query((db) =>
    db
      .select({ createdAt: staffTaskAssignments.createdAt })
      .from(staffTaskAssignments)
      .where(and(eq(staffTaskAssignments.taskId, taskId), eq(staffTaskAssignments.userId, userId)))
  ).pipe(Effect.map(([row]) => row?.createdAt ?? new Date()));

/** After a swap: every staff screen re-reads the tasks, the event's live views its log. */
const swapped = (eventId: string, ids: readonly [string, string]) =>
  Effect.gen(function* () {
    yield* ping(eventId, "tasks_changed");
    yield* opsPing(eventId, "activity");

    return [yield* taskInEvent(ids[0], eventId), yield* taskInEvent(ids[1], eventId)];
  });

const nameIn = (task: StaffTask, userId: string) =>
  task.assignees.find((assignee) => assignee.userId === userId)?.name ?? "";

/** `a` takes `b`'s place and `b` takes `a`'s. Swapping back is the same call with the tasks the other way. */
export const swapAssignees = ({ eventId, a, b }: SwapInput) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const [x, y] = yield* lockTwo(eventId, [a.taskId, b.taskId]);
        yield* refuse(swapProblem(x, a.userId, y, b.userId));
        // Each takes the other's exact place in the list, so swapping back leaves both as they were.
        const [aPlaced, bPlaced] = [yield* placedAt(x.id, a.userId), yield* placedAt(y.id, b.userId)];
        yield* moveSeat(x.id, a.userId, y.id, bPlaced);
        yield* moveSeat(y.id, b.userId, x.id, aPlaced);
        yield* logTask(
          x,
          "task.people_swapped",
          `intercambió a ${nameIn(x, a.userId)} (${clip(x.title)}) y ${nameIn(y, b.userId)} (${clip(y.title)})`
        );
      })
    );

    return yield* swapped(eventId, [a.taskId, b.taskId]);
  });

/** Someone leaves one task for another. Moving back is the same call the other way. */
export const moveAssignee = ({ eventId, taskId, userId, toTaskId }: MoveInput) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const [from, to] = yield* lockTwo(eventId, [taskId, toTaskId]);
        yield* refuse(moveProblem(from, userId, to));
        yield* moveSeat(from.id, userId, to.id);
        yield* logTask(
          from,
          "task.person_moved",
          `pasó a ${nameIn(from, userId)} de ${quoted(from.title)} a ${quoted(to.title)}`
        );
      })
    );

    return yield* swapped(eventId, [taskId, toTaskId]);
  });

/** Two tasks trade their day, start and end, like two talks trading slots. Doing it again undoes it. */
export const swapTimes = ({ eventId, taskId, otherTaskId }: SwapTimesInput) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const [x, y] = yield* lockTwo(eventId, [taskId, otherTaskId]);
        yield* refuse(timesProblem(x, y));
        const timesOf = (task: StaffTask) => ({
          dayDate: fromDayString(task.dayDate),
          startTime: task.startTime,
          endTime: task.endTime,
        });
        yield* query((db) => db.update(staffTasks).set(timesOf(y)).where(eq(staffTasks.id, x.id)));
        yield* query((db) => db.update(staffTasks).set(timesOf(x)).where(eq(staffTasks.id, y.id)));
        yield* logTask(x, "task.times_swapped", `intercambió el horario de ${quoted(x.title)} y ${quoted(y.title)}`);
      })
    );

    return yield* swapped(eventId, [taskId, otherTaskId]);
  });

/**
 * "Vamos 15 tarde": shift every timed task of the day from a given time on.
 * The rows are locked as they are read, so two shifts at once add up instead
 * of one overwriting the other.
 */
export const shiftFrom = (input: ShiftInput) =>
  Effect.gen(function* () {
    const count = yield* transaction(
      Effect.gen(function* () {
        const rows = yield* query((db) =>
          db
            .select({ id: staffTasks.id, startTime: staffTasks.startTime, endTime: staffTasks.endTime })
            .from(staffTasks)
            .where(
              and(
                eq(staffTasks.openSpaceId, input.eventId),
                eq(staffTasks.dayDate, fromDayString(input.dayDate)),
                gte(staffTasks.startTime, input.fromTime)
              )
            )
            .for("update")
        );
        yield* Effect.forEach(
          rows,
          (row) =>
            query((db) =>
              db
                .update(staffTasks)
                .set({
                  startTime: row.startTime && shiftTime(row.startTime, input.deltaMinutes),
                  endTime: row.endTime && shiftTime(row.endTime, input.deltaMinutes),
                })
                .where(eq(staffTasks.id, row.id))
            ),
          { discard: true }
        );
        if (rows.length > 0) {
          const delta = `${input.deltaMinutes > 0 ? "+" : "−"}${Math.abs(input.deltaMinutes)} min`;
          yield* recordActivity({
            eventId: input.eventId,
            verb: "task.shifted",
            entityType: "task",
            summary: `corrió ${plural(rows.length, "tarea", "tareas")} ${delta} desde las ${input.fromTime}`,
          });
        }

        return rows.length;
      })
    );
    if (count > 0) yield* ping(input.eventId, "tasks_changed");

    return { count };
  });

/** Who can be put on a task: the community's staff. */
export const roster = () =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    return yield* staffOf(communityId);
  });

/** Most rows one paste may bring: a day's plan is a few dozen. */
const MAX_IMPORT_ROWS = 300;

/**
 * "Importar planilla": rows pasted from the team's spreadsheet become tasks, people matched by
 * name against the roster. A dry run only says what would happen; the real run creates every
 * new row in one transaction, and refuses while any row has errors. Rows already on the
 * schedule (same day, start and title) are skipped, so pasting the sheet again is harmless.
 */
export const importTasks = ({ eventId, tsv, dryRun }: ImportInput) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [[event], staff, existing] = yield* Effect.all(
      [
        query((db) =>
          db
            .select({ startDate: events.startDate, timezone: events.timezone })
            .from(events)
            .where(eq(events.id, eventId))
        ),
        staffOf(communityId),
        query((db) =>
          db
            .select({ dayDate: staffTasks.dayDate, startTime: staffTasks.startTime, title: staffTasks.title })
            .from(staffTasks)
            .where(eq(staffTasks.openSpaceId, eventId))
        ),
      ],
      { concurrency: "unbounded" }
    );
    if (!event) return yield* new NotFound({ entity: "event", message: "Ese evento no existe" });

    const defaultDay = wallClock(event.startDate, event.timezone).slice(0, 10);
    const parsed = parseSheet(tsv, {
      roster: staff.map(({ userId, name, image }) => ({ userId, name, image })),
      defaultDay,
    });
    if (parsed.length > MAX_IMPORT_ROWS) {
      return yield* new Invalid({ message: `Pegá hasta ${MAX_IMPORT_ROWS} filas por vez (llegaron ${parsed.length})` });
    }
    const seen = new Set(existing.map((task) => taskKey({ ...task, dayDate: toDayString(task.dayDate) })));
    const rows = parsed.map((row): ImportRow => {
      const key = taskKey(row);
      const duplicate = seen.has(key);
      if (row.errors.length === 0) seen.add(key);
      return { ...row, duplicate };
    });
    if (dryRun) return { rows, created: 0 };

    const invalid = rows.filter((row) => row.errors.length > 0);
    if (invalid.length > 0) {
      return yield* new Invalid({
        message:
          invalid.length === 1
            ? `La fila ${invalid[0].line} tiene errores: corregila y volvé a pegar`
            : `${invalid.length} filas tienen errores: corregilas y volvé a pegar`,
      });
    }
    const fresh = rows.filter((row) => !row.duplicate).map((row) => ({ ...row, id: createId() }));
    if (fresh.length === 0) return { rows, created: 0 };

    yield* transaction(
      Effect.gen(function* () {
        yield* query((db) =>
          db.insert(staffTasks).values(
            fresh.map((row, index) => ({
              id: row.id,
              openSpaceId: eventId,
              title: row.title,
              notes: row.notes,
              type: row.type,
              dayDate: fromDayString(row.dayDate ?? defaultDay),
              startTime: row.startTime,
              endTime: row.endTime,
              minPeople: row.minPeople,
              location: row.location,
              // Same start time: keep the sheet's order.
              sortOrder: index,
            }))
          )
        );
        // In the sheet's order, a millisecond apart (see `assign`).
        const now = Date.now();
        const assignments = fresh.flatMap((row) =>
          row.people.map((member, index) => ({
            taskId: row.id,
            userId: member.userId,
            createdAt: new Date(now + index),
          }))
        );
        if (assignments.length > 0) yield* query((db) => db.insert(staffTaskAssignments).values(assignments));
        yield* recordActivity({
          eventId,
          verb: "task.imported",
          entityType: "task",
          summary: `importó ${plural(fresh.length, "tarea", "tareas")} de una planilla`,
        });
      })
    );
    yield* ping(eventId, "tasks_changed");

    return { rows, created: fresh.length };
  });

// ---------------------------------------------------------------------------
// Arrivals: who is at the venue
// ---------------------------------------------------------------------------

export const listArrivals = (eventId: string) =>
  query((db) =>
    db
      .select({
        userId: staffArrivals.userId,
        name: user.name,
        image: user.image,
        arrivedAt: staffArrivals.arrivedAt,
        leftAt: staffArrivals.leftAt,
      })
      .from(staffArrivals)
      .innerJoin(user, eq(user.id, staffArrivals.userId))
      .where(eq(staffArrivals.eventId, eventId))
      .orderBy(asc(staffArrivals.arrivedAt))
  ).pipe(
    Effect.map((rows) =>
      rows.map((row): StaffArrival => ({
        ...row,
        arrivedAt: row.arrivedAt.toISOString(),
        leftAt: row.leftAt?.toISOString() ?? null,
      }))
    )
  );

/** Whose arrival this is: yours, or (for an editor) a staff member's. */
const arrivalTarget = (input: ArrivalInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const userId = input.userId ?? me.id;
    if (userId === me.id) return { userId, name: me.name, self: true };

    yield* ensureEditor("Solo quien organiza puede marcar la llegada de otra persona");
    yield* ensureStaff([userId]);
    const [row] = yield* query((db) => db.select({ name: user.name }).from(user).where(eq(user.id, userId)));
    return { userId, name: row?.name ?? "", self: false };
  });

const arrivalOf = (eventId: string, userId: string) =>
  listArrivals(eventId).pipe(Effect.map((arrivals) => arrivals.find((arrival) => arrival.userId === userId)));

const savedArrival = (eventId: string, userId: string) =>
  arrivalOf(eventId, userId).pipe(
    Effect.flatMap((arrival) =>
      arrival
        ? Effect.succeed(arrival)
        : Effect.fail(new NotFound({ entity: "arrival", message: "No encontramos esa llegada" }))
    )
  );

/** "Llegué": at the venue from now (again, if they had gone). Tapping it twice changes nothing. */
export const arrive = (input: ArrivalInput) =>
  Effect.gen(function* () {
    const target = yield* arrivalTarget(input);
    const current = yield* arrivalOf(input.eventId, target.userId);
    if (current && !current.leftAt) return current;

    yield* transaction(
      Effect.gen(function* () {
        yield* query((db) =>
          db
            .insert(staffArrivals)
            .values({ eventId: input.eventId, userId: target.userId })
            .onConflictDoUpdate({
              target: [staffArrivals.eventId, staffArrivals.userId],
              set: { arrivedAt: new Date(), leftAt: null },
            })
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "staff.arrived",
          entityType: "staff",
          entityId: target.userId,
          summary: target.self ? (current ? "volvió al turno" : "llegó") : `marcó que ${target.name} llegó`,
        });
      })
    );
    yield* opsPing(input.eventId, "arrivals");

    return yield* savedArrival(input.eventId, target.userId);
  });

/** "Salir del turno": they went home, so they no longer count on shift. */
export const leaveShift = (input: ArrivalInput) =>
  Effect.gen(function* () {
    const target = yield* arrivalTarget(input);
    const current = yield* arrivalOf(input.eventId, target.userId);
    if (!current) {
      return yield* new Invalid({
        message: target.self ? "Todavía no marcaste tu llegada" : `${target.name} todavía no llegó`,
      });
    }
    if (current.leftAt) return current;

    yield* transaction(
      Effect.gen(function* () {
        yield* query((db) =>
          db
            .update(staffArrivals)
            .set({ leftAt: new Date() })
            .where(and(eq(staffArrivals.eventId, input.eventId), eq(staffArrivals.userId, target.userId)))
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "staff.left",
          entityType: "staff",
          entityId: target.userId,
          summary: target.self ? "terminó su turno" : `marcó que ${target.name} se fue`,
        });
      })
    );
    yield* opsPing(input.eventId, "arrivals");

    return yield* savedArrival(input.eventId, target.userId);
  });

/** Today's staff on the event's own clock: on a task, free, late, not here yet or gone. */
export const onShift = (eventId: string) =>
  Effect.gen(function* () {
    const [[event], tasks, arrivals] = yield* Effect.all(
      [
        query((db) => db.select({ timezone: events.timezone }).from(events).where(eq(events.id, eventId))),
        listTasks(eventId),
        listArrivals(eventId),
      ],
      { concurrency: "unbounded" }
    );
    const clock = wallClock(new Date(), event?.timezone ?? "America/Montevideo");

    return summarizeShift({ tasks, arrivals, day: clock.slice(0, 10), nowMin: toMinutes(clock.slice(11)) });
  });

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export const listAnnouncements = (eventId: string) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const { communityId } = yield* CommunityScope;
    const [rows, staff] = yield* Effect.all(
      [
        query((db) =>
          db.query.staffAnnouncements.findMany({
            where: eq(staffAnnouncements.openSpaceId, eventId),
            with: {
              author: person,
              task: { columns: { id: true, title: true }, with: { assignments: { with: { user: person } } } },
              acks: { with: { user: person } },
            },
            orderBy: desc(staffAnnouncements.createdAt),
            limit: 100,
          })
        ),
        // Recipient universe for "all": the community's staff.
        staffOf(communityId),
      ],
      { concurrency: "unbounded" }
    );

    return rows.map((row): StaffAnnouncement => {
      const acks = row.acks
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((ack) => ({
          userId: ack.user.id,
          name: ack.user.name,
          image: ack.user.image,
          ackedAt: ack.createdAt.toISOString(),
        }));

      // Task announcements only concern that task's assignees.
      const recipients =
        row.audience === "task" && row.task
          ? row.task.assignments.map((a) => ({ userId: a.user.id, name: a.user.name, image: a.user.image }))
          : staff.map((member) => ({ userId: member.userId, name: member.name, image: member.image }));

      const ackedIds = new Set(acks.map((ack) => ack.userId));
      const pending = recipients.filter(
        // The author wrote it — they are not waiting to read it.
        (recipient) => !ackedIds.has(recipient.userId) && recipient.userId !== row.authorId
      );

      return {
        id: row.id,
        openSpaceId: row.openSpaceId,
        body: row.body,
        urgent: row.urgent,
        audience: row.audience,
        taskId: row.taskId,
        taskTitle: row.task?.title ?? null,
        author: row.author,
        createdAt: row.createdAt.toISOString(),
        ackCount: acks.length,
        ackedByMe: ackedIds.has(me.id),
        acks,
        pending,
      };
    });
  });

export const createAnnouncement = (input: CreateAnnouncementInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const taskId = input.audience === "task" ? input.taskId : undefined;
    if (taskId) yield* taskInEvent(taskId, input.eventId);

    const row = yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .insert(staffAnnouncements)
            .values({
              openSpaceId: input.eventId,
              authorId: me.id,
              body: input.body,
              urgent: input.urgent,
              audience: input.audience,
              taskId: taskId ?? null,
            })
            .returning({ id: staffAnnouncements.id })
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "announcement.created",
          entityType: "announcement",
          entityId: row.id,
          summary: `${input.urgent ? "mandó un aviso urgente" : "avisó al staff"}: ${quoted(input.body)}`,
        });
        return row;
      })
    );
    yield* ping(input.eventId, "announcement_created", { id: row.id });

    return row;
  });

export const ackAnnouncement = ({ eventId, announcementId }: AckInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const [announcement] = yield* query((db) =>
      db
        .select({ id: staffAnnouncements.id })
        .from(staffAnnouncements)
        .where(and(eq(staffAnnouncements.id, announcementId), eq(staffAnnouncements.openSpaceId, eventId)))
    );
    if (!announcement) return yield* announcementNotFound;

    yield* query((db) =>
      db.insert(staffAnnouncementAcks).values({ announcementId, userId: me.id }).onConflictDoNothing()
    );
    // Ack counts are interesting to everyone watching the panel.
    yield* ping(eventId, "tasks_changed");

    return { ok: true as const };
  });

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * "Reenviar por Owy": a Slack DM from Owy to everyone who hasn't marked an announcement as
 * received, with a link to Mi turno. Says who got it and who couldn't (no Slack account, Slack
 * said no); without Owy's Slack token nobody can, and it fails saying so.
 */
export const remind = ({ eventId, announcementId }: AckInput) =>
  Effect.gen(function* () {
    const announcement = (yield* listAnnouncements(eventId)).find((item) => item.id === announcementId);
    if (!announcement) return yield* announcementNotFound;
    if (announcement.pending.length === 0) return { sent: [], failed: [] };
    if (!owyChannels().staffDm) {
      return yield* new UpstreamFailed({
        service: "Owy",
        message: "Owy no puede mandar mensajes directos: falta OWY_SLACK_BOT_TOKEN",
      });
    }

    const [slackAccounts, [where]] = yield* Effect.all(
      [
        query((db) =>
          db
            .select({ userId: account.userId, slackId: account.accountId })
            .from(account)
            .where(
              and(
                eq(account.providerId, "slack"),
                inArray(
                  account.userId,
                  announcement.pending.map((recipient) => recipient.userId)
                )
              )
            )
        ),
        query((db) =>
          db
            .select({ event: events.slug, community: communities.slug })
            .from(events)
            .innerJoin(communities, eq(communities.id, events.communityId))
            .where(eq(events.id, eventId))
        ),
      ],
      { concurrency: "unbounded" }
    );
    const slackOf = new Map(slackAccounts.map((row) => [row.userId, row.slackId]));
    const site = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.owu.uy").replace(/\/$/, "");
    const link = `${site}/admin/${where?.community}/mi-turno?event=${encodeURIComponent(where?.event ?? "")}`;
    const message = (name: string) =>
      [
        `Hola ${firstName(name)}: ${announcement.author?.name ?? "El equipo"} mandó un aviso${announcement.urgent ? " urgente" : ""} y todavía no lo marcaste como recibido.`,
        `> ${announcement.body.replace(/\n/g, "\n> ")}`,
        `Marcalo en Mi turno: ${link}`,
      ].join("\n\n");

    const [sent, failed] = yield* Effect.partition(
      announcement.pending,
      (recipient) => {
        const slackId = slackOf.get(recipient.userId);
        return slackId
          ? sendSlackDm(slackId, message(recipient.name)).pipe(
              Effect.as(recipient),
              Effect.mapError((error) => ({ ...recipient, reason: error.message }))
            )
          : Effect.fail({ ...recipient, reason: "No tiene Slack vinculado" });
      },
      { concurrency: 4 }
    );
    if (sent.length > 0) {
      yield* recordActivity({
        eventId,
        verb: "announcement.reminded",
        entityType: "announcement",
        entityId: announcementId,
        summary: `reenvió por Owy un aviso a ${plural(sent.length, "persona", "personas")}`,
      });
    }

    return { sent, failed };
  });
