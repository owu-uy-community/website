import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { Effect } from "effect";
import type * as z from "zod";

import {
  communityMembers,
  staffAnnouncementAcks,
  staffAnnouncements,
  staffTaskAssignments,
  staffTasks,
  user,
  type StaffTaskRow,
} from "../../db/schema";
import { eventChannel } from "../../realtime/channels";
import { query, transaction } from "../db";
import { Invalid, NotFound } from "../errors";
import { CommunityScope, CurrentUser, Realtime } from "../services";
import type {
  AckStaffAnnouncementSchema,
  AssignStaffTaskSchema,
  CreateStaffAnnouncementSchema,
  CreateStaffTaskSchema,
  JoinStaffTaskSchema,
  SetStaffTaskStatusSchema,
  ShiftStaffTasksSchema,
  StaffAnnouncement,
  StaffMember,
  StaffTask,
  UpdateStaffTaskSchema,
} from "./schemas";

type CreateInput = z.infer<typeof CreateStaffTaskSchema>;
type UpdateInput = z.infer<typeof UpdateStaffTaskSchema>;
type TaskRef = z.infer<typeof JoinStaffTaskSchema>;
type SetStatusInput = z.infer<typeof SetStaffTaskStatusSchema>;
type AssignInput = z.infer<typeof AssignStaffTaskSchema>;
type ShiftInput = z.infer<typeof ShiftStaffTasksSchema>;
type CreateAnnouncementInput = z.infer<typeof CreateStaffAnnouncementSchema>;
type AckInput = z.infer<typeof AckStaffAnnouncementSchema>;

/** dayDate is a date-only value stored as UTC midnight, transported "YYYY-MM-DD". */
const toDayString = (date: Date): string => date.toISOString().slice(0, 10);
const fromDayString = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/** Move an "HH:MM" by some minutes, clamped to the same day rather than wrapping into the next. */
const shiftTime = (time: string, deltaMinutes: number): string => {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + deltaMinutes));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

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

type TaskWithAssignments = StaffTaskRow & {
  assignments: { user: { id: string; name: string; image: string | null } }[];
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
  assignees: row.assignments.map((a) => ({ userId: a.user.id, name: a.user.name, image: a.user.image })),
});

const taskNotFound = new NotFound({ entity: "task", message: "Esa tarea no es de este evento" });

/** A task with its people — only if it belongs to the event the caller was let into. */
const taskInEvent = (taskId: string, eventId: string) =>
  query((db) =>
    db.query.staffTasks.findFirst({
      where: and(eq(staffTasks.id, taskId), eq(staffTasks.openSpaceId, eventId)),
      with: { assignments: { with: { user: person } } },
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

const assign = (taskId: string, userIds: readonly string[]) =>
  userIds.length === 0
    ? Effect.void
    : query((db) =>
        db
          .insert(staffTaskAssignments)
          .values(userIds.map((userId) => ({ taskId, userId })))
          .onConflictDoNothing()
      );

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const listTasks = (eventId: string) =>
  query((db) =>
    db.query.staffTasks.findMany({
      where: eq(staffTasks.openSpaceId, eventId),
      with: { assignments: { with: { user: person } } },
    })
  ).pipe(
    Effect.map((rows) =>
      rows.map(toTask).toSorted(
        (a, b) =>
          a.dayDate.localeCompare(b.dayDate) ||
          // Untimed tasks sink to the end of the day
          (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") ||
          a.sortOrder - b.sortOrder ||
          a.createdAt.localeCompare(b.createdAt)
      )
    )
  );

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
            .returning({ id: staffTasks.id })
        );
        yield* assign(task.id, input.assigneeIds ?? []);

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
          const current = new Set(task.assignees.map((assignee) => assignee.userId));
          yield* ensureStaff(data.assigneeIds.filter((id) => !current.has(id)));
          yield* query((db) => db.delete(staffTaskAssignments).where(eq(staffTaskAssignments.taskId, taskId)));
          yield* assign(taskId, data.assigneeIds);
        }
      })
    );
    yield* ping(eventId, "tasks_changed");

    return yield* taskInEvent(taskId, eventId);
  });

export const deleteTask = ({ eventId, taskId }: TaskRef) =>
  Effect.gen(function* () {
    const task = yield* taskInEvent(taskId, eventId);
    yield* query((db) => db.delete(staffTasks).where(eq(staffTasks.id, taskId)));
    yield* ping(eventId, "tasks_changed");

    return task;
  });

export const setStatus = ({ eventId, taskId, status }: SetStatusInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const updated = yield* query((db) =>
      db
        .update(staffTasks)
        .set({ status, statusUpdatedById: me.id })
        .where(and(eq(staffTasks.id, taskId), eq(staffTasks.openSpaceId, eventId)))
        .returning({ id: staffTasks.id })
    );
    if (updated.length === 0) return yield* taskNotFound;
    yield* ping(eventId, "tasks_changed");

    return yield* taskInEvent(taskId, eventId);
  });

const addAssignee = ({ eventId, taskId }: TaskRef, userId: string) =>
  Effect.gen(function* () {
    yield* taskInEvent(taskId, eventId);
    yield* assign(taskId, [userId]);
    yield* ping(eventId, "tasks_changed");

    return yield* taskInEvent(taskId, eventId);
  });

const removeAssignee = ({ eventId, taskId }: TaskRef, userId: string) =>
  Effect.gen(function* () {
    yield* taskInEvent(taskId, eventId);
    yield* query((db) =>
      db
        .delete(staffTaskAssignments)
        .where(and(eq(staffTaskAssignments.taskId, taskId), eq(staffTaskAssignments.userId, userId)))
    );
    yield* ping(eventId, "tasks_changed");

    return yield* taskInEvent(taskId, eventId);
  });

export const join = (input: TaskRef) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    return yield* addAssignee(input, me.id);
  });

export const leave = (input: TaskRef) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    return yield* removeAssignee(input, me.id);
  });

/** An editor puts a staff member on a task. */
export const assignTo = (input: AssignInput) =>
  Effect.gen(function* () {
    yield* ensureStaff([input.userId]);
    return yield* addAssignee(input, input.userId);
  });

export const unassign = (input: AssignInput) => removeAssignee(input, input.userId);

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
    if (!announcement) {
      return yield* new NotFound({ entity: "announcement", message: "Ese aviso no es de este evento" });
    }

    yield* query((db) =>
      db.insert(staffAnnouncementAcks).values({ announcementId, userId: me.id }).onConflictDoNothing()
    );
    // Ack counts are interesting to everyone watching the panel.
    yield* ping(eventId, "tasks_changed");

    return { ok: true as const };
  });
