import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import * as z from "zod";

import { db } from "../../../db";
import {
  communityMembers,
  staffAnnouncementAcks,
  staffAnnouncements,
  staffTaskAssignments,
  staffTasks,
  user,
  type StaffTaskRow,
} from "../../../db/schema";
import { eventChannel } from "../../../realtime/channels";
import { publishServer } from "../../../realtime/publish";
import type {
  AckStaffAnnouncementSchema,
  AssignStaffTaskSchema,
  CreateStaffAnnouncementSchema,
  CreateStaffTaskSchema,
  DeleteStaffTaskSchema,
  JoinStaffTaskSchema,
  ListStaffAnnouncementsSchema,
  ListStaffTasksSchema,
  SetStaffTaskStatusSchema,
  ShiftStaffTasksSchema,
  StaffAnnouncement,
  StaffTask,
  UpdateStaffTaskSchema,
} from "../schemas";

type ListInput = z.infer<typeof ListStaffTasksSchema>;
type CreateInput = z.infer<typeof CreateStaffTaskSchema>;
type UpdateInput = z.infer<typeof UpdateStaffTaskSchema>;
type DeleteInput = z.infer<typeof DeleteStaffTaskSchema>;
type SetStatusInput = z.infer<typeof SetStaffTaskStatusSchema>;
type JoinInput = z.infer<typeof JoinStaffTaskSchema>;
type AssignInput = z.infer<typeof AssignStaffTaskSchema>;
type ShiftInput = z.infer<typeof ShiftStaffTasksSchema>;
type ListAnnouncementsInput = z.infer<typeof ListStaffAnnouncementsSchema>;
type CreateAnnouncementInput = z.infer<typeof CreateStaffAnnouncementSchema>;
type AckInput = z.infer<typeof AckStaffAnnouncementSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** dayDate is a date-only value stored as UTC midnight, transported "YYYY-MM-DD". */
const toDayString = (date: Date): string => date.toISOString().slice(0, 10);
const fromDayString = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

const shiftTime = (time: string, deltaMinutes: number): string => {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + deltaMinutes));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * The staff channel is publicly subscribable (the hub only gates `private:*`),
 * so broadcasts are content-free pings — data always flows through guarded
 * oRPC reads.
 */
const pingTasksChanged = (eventId: string) =>
  publishServer(eventChannel(eventId, "staff"), "tasks_changed", {}).catch((error) => {
    console.error("[StaffTasks] Failed to broadcast tasks_changed:", error);
  });

const pingAnnouncementCreated = (eventId: string, id: string) =>
  publishServer(eventChannel(eventId, "staff"), "announcement_created", { id }).catch((error) => {
    console.error("[StaffTasks] Failed to broadcast announcement_created:", error);
  });

type TaskWithAssignments = StaffTaskRow & {
  assignments: { userId: string; user: { id: string; name: string; image: string | null } }[];
};

const transformTask = (row: TaskWithAssignments): StaffTask => ({
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

/** Fetch one task scoped to its event — every mutation goes through this. */
const requireTaskInEvent = async (taskId: string, eventId: string): Promise<StaffTaskRow> => {
  const [task] = await db
    .select()
    .from(staffTasks)
    .where(and(eq(staffTasks.id, taskId), eq(staffTasks.openSpaceId, eventId)));
  if (!task) {
    throw new ORPCError("NOT_FOUND", { message: "Task not found in this event" });
  }
  return task;
};

const fetchTask = async (taskId: string): Promise<StaffTask> => {
  const row = await db.query.staffTasks.findFirst({
    where: eq(staffTasks.id, taskId),
    with: { assignments: { with: { user: { columns: { id: true, name: true, image: true } } } } },
  });
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Task not found" });
  return transformTask(row as TaskWithAssignments);
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const listStaffTasks = async ({ eventId }: ListInput): Promise<StaffTask[]> => {
  const rows = await db.query.staffTasks.findMany({
    where: eq(staffTasks.openSpaceId, eventId),
    with: { assignments: { with: { user: { columns: { id: true, name: true, image: true } } } } },
  });

  return rows
    .map((row) => transformTask(row as TaskWithAssignments))
    .sort(
      (a, b) =>
        a.dayDate.localeCompare(b.dayDate) ||
        // Untimed tasks sink to the end of the day
        (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") ||
        a.sortOrder - b.sortOrder ||
        a.createdAt.localeCompare(b.createdAt)
    );
};

export const createStaffTask = async (input: CreateInput): Promise<StaffTask> => {
  const [task] = await db
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
    .returning();

  if (input.assigneeIds?.length) {
    await db
      .insert(staffTaskAssignments)
      .values(input.assigneeIds.map((userId) => ({ taskId: task.id, userId })))
      .onConflictDoNothing();
  }

  await pingTasksChanged(input.eventId);
  return fetchTask(task.id);
};

export const updateStaffTask = async ({ eventId, taskId, data }: UpdateInput): Promise<StaffTask> => {
  await requireTaskInEvent(taskId, eventId);

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
    await db.update(staffTasks).set(patch).where(eq(staffTasks.id, taskId));
  }

  if (data.assigneeIds !== undefined) {
    await db.delete(staffTaskAssignments).where(eq(staffTaskAssignments.taskId, taskId));
    if (data.assigneeIds.length > 0) {
      await db
        .insert(staffTaskAssignments)
        .values(data.assigneeIds.map((userId) => ({ taskId, userId })))
        .onConflictDoNothing();
    }
  }

  await pingTasksChanged(eventId);
  return fetchTask(taskId);
};

export const deleteStaffTask = async ({ eventId, taskId }: DeleteInput): Promise<StaffTask> => {
  await requireTaskInEvent(taskId, eventId);
  const task = await fetchTask(taskId);
  await db.delete(staffTasks).where(eq(staffTasks.id, taskId));
  await pingTasksChanged(eventId);
  return task;
};

export const setStaffTaskStatus = async (input: SetStatusInput, actorId: string): Promise<StaffTask> => {
  await requireTaskInEvent(input.taskId, input.eventId);
  await db
    .update(staffTasks)
    .set({ status: input.status, statusUpdatedById: actorId })
    .where(eq(staffTasks.id, input.taskId));
  await pingTasksChanged(input.eventId);
  return fetchTask(input.taskId);
};

export const joinStaffTask = async (input: JoinInput, actorId: string): Promise<StaffTask> => {
  await requireTaskInEvent(input.taskId, input.eventId);
  await db.insert(staffTaskAssignments).values({ taskId: input.taskId, userId: actorId }).onConflictDoNothing();
  await pingTasksChanged(input.eventId);
  return fetchTask(input.taskId);
};

export const leaveStaffTask = async (input: JoinInput, actorId: string): Promise<StaffTask> => {
  await requireTaskInEvent(input.taskId, input.eventId);
  await db
    .delete(staffTaskAssignments)
    .where(and(eq(staffTaskAssignments.taskId, input.taskId), eq(staffTaskAssignments.userId, actorId)));
  await pingTasksChanged(input.eventId);
  return fetchTask(input.taskId);
};

export const assignStaffTask = async (input: AssignInput): Promise<StaffTask> => {
  await requireTaskInEvent(input.taskId, input.eventId);
  await db.insert(staffTaskAssignments).values({ taskId: input.taskId, userId: input.userId }).onConflictDoNothing();
  await pingTasksChanged(input.eventId);
  return fetchTask(input.taskId);
};

export const unassignStaffTask = async (input: AssignInput): Promise<StaffTask> => {
  await requireTaskInEvent(input.taskId, input.eventId);
  await db
    .delete(staffTaskAssignments)
    .where(and(eq(staffTaskAssignments.taskId, input.taskId), eq(staffTaskAssignments.userId, input.userId)));
  await pingTasksChanged(input.eventId);
  return fetchTask(input.taskId);
};

/** "Vamos 15 tarde": shift every timed task of the day from a given time on. */
export const shiftStaffTasks = async (input: ShiftInput): Promise<{ count: number }> => {
  const rows = await db
    .select({ id: staffTasks.id, startTime: staffTasks.startTime, endTime: staffTasks.endTime })
    .from(staffTasks)
    .where(
      and(
        eq(staffTasks.openSpaceId, input.eventId),
        eq(staffTasks.dayDate, fromDayString(input.dayDate)),
        gte(staffTasks.startTime, input.fromTime)
      )
    );

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .update(staffTasks)
        .set({
          startTime: row.startTime ? shiftTime(row.startTime, input.deltaMinutes) : row.startTime,
          endTime: row.endTime ? shiftTime(row.endTime, input.deltaMinutes) : row.endTime,
        })
        .where(eq(staffTasks.id, row.id));
    }
  });

  if (rows.length > 0) await pingTasksChanged(input.eventId);
  return { count: rows.length };
};

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export const listStaffAnnouncements = async (
  { eventId }: ListAnnouncementsInput,
  meId: string,
  communityId: string
): Promise<StaffAnnouncement[]> => {
  const [rows, members] = await Promise.all([
    db.query.staffAnnouncements.findMany({
      where: eq(staffAnnouncements.openSpaceId, eventId),
      with: {
        author: { columns: { id: true, name: true, image: true } },
        task: {
          columns: { id: true, title: true },
          with: { assignments: { with: { user: { columns: { id: true, name: true, image: true } } } } },
        },
        acks: { with: { user: { columns: { id: true, name: true, image: true } } } },
      },
      orderBy: desc(staffAnnouncements.createdAt),
      limit: 100,
    }),
    // Recipient universe for "all": the community roster.
    db
      .select({ userId: communityMembers.userId, name: user.name, image: user.image })
      .from(communityMembers)
      .innerJoin(user, eq(user.id, communityMembers.userId))
      .where(eq(communityMembers.communityId, communityId))
      .orderBy(asc(user.name)),
  ]);

  return rows.map((row) => {
    const acks = [...row.acks]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((ack) => ({
        userId: ack.user.id,
        name: ack.user.name,
        image: ack.user.image,
        ackedAt: ack.createdAt.toISOString(),
      }));

    // Task announcements only concern that task's assignees.
    const recipients =
      row.audience === "task" && row.task
        ? row.task.assignments.map((assignment) => ({
            userId: assignment.user.id,
            name: assignment.user.name,
            image: assignment.user.image,
          }))
        : members;

    const ackedIds = new Set(acks.map((ack) => ack.userId));
    const pending = recipients.filter(
      // The author wrote it — they are not waiting to read it.
      (person) => !ackedIds.has(person.userId) && person.userId !== row.authorId
    );

    return {
      id: row.id,
      openSpaceId: row.openSpaceId,
      body: row.body,
      urgent: row.urgent,
      audience: row.audience,
      taskId: row.taskId,
      taskTitle: row.task?.title ?? null,
      author: row.author ? { id: row.author.id, name: row.author.name, image: row.author.image } : null,
      createdAt: row.createdAt.toISOString(),
      ackCount: acks.length,
      ackedByMe: ackedIds.has(meId),
      acks,
      pending,
    };
  });
};

export const createStaffAnnouncement = async (
  input: CreateAnnouncementInput,
  authorId: string
): Promise<{ id: string }> => {
  if (input.audience === "task" && input.taskId) {
    await requireTaskInEvent(input.taskId, input.eventId);
  }

  const [row] = await db
    .insert(staffAnnouncements)
    .values({
      openSpaceId: input.eventId,
      authorId,
      body: input.body,
      urgent: input.urgent,
      audience: input.audience,
      taskId: input.audience === "task" ? (input.taskId ?? null) : null,
    })
    .returning({ id: staffAnnouncements.id });

  await pingAnnouncementCreated(input.eventId, row.id);
  return row;
};

export const ackStaffAnnouncement = async (input: AckInput, meId: string): Promise<{ ok: true }> => {
  const [announcement] = await db
    .select({ id: staffAnnouncements.id })
    .from(staffAnnouncements)
    .where(and(eq(staffAnnouncements.id, input.announcementId), eq(staffAnnouncements.openSpaceId, input.eventId)));
  if (!announcement) {
    throw new ORPCError("NOT_FOUND", { message: "Announcement not found in this event" });
  }

  await db
    .insert(staffAnnouncementAcks)
    .values({ announcementId: input.announcementId, userId: meId })
    .onConflictDoNothing();

  // Ack counts are interesting to everyone watching the panel.
  await pingTasksChanged(input.eventId);
  return { ok: true };
};
