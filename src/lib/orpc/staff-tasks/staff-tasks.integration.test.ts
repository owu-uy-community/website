import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { staffTasks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { eventChannel } from "lib/realtime/channels";
import { hub } from "lib/realtime/hub";
import { by, type RouterInputs } from "test/context";
import { makeBoard, makeMember, makeSiteAdmin, makeUser } from "test/factories";

const DAY = "2026-11-07";

async function setup() {
  const board = await makeBoard();
  const [editor, member, colleague, outsider] = await Promise.all([
    makeMember(board.community.id, "editor", { name: "Editora" }),
    makeMember(board.community.id, "member", { name: "Miembro" }),
    makeMember(board.community.id, "member", { name: "Colega" }),
    makeUser({ name: "Afuera" }),
  ]);
  const eventId = board.event.id;
  const createTask = (data: Partial<RouterInputs["staffTasks"]["create"]> = {}) =>
    call(router.staffTasks.create, { eventId, title: "Acreditación", dayDate: DAY, ...data }, by(editor));

  return { ...board, eventId, editor, member, colleague, outsider, createTask };
}

describe("staff tasks", () => {
  test("members list the event's tasks by day and time, untimed last", async () => {
    const { eventId, member, createTask } = await setup();
    await createTask({ title: "Cierre", startTime: "20:00" });
    await createTask({ title: "Sin hora" });
    await createTask({ title: "Apertura", startTime: "14:30" });

    const tasks = await call(router.staffTasks.list, { eventId }, by(member));

    expect(tasks.map((task) => task.title)).toStrictEqual(["Apertura", "Cierre", "Sin hora"]);
  });

  test("people outside the community cannot see or change tasks", async () => {
    const { eventId, outsider } = await setup();
    const elsewhere = await setup();

    await expect(call(router.staffTasks.list, { eventId }, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(call(router.staffTasks.list, { eventId }, by(outsider))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      call(router.staffTasks.create, { eventId, title: "X", dayDate: DAY }, by(elsewhere.editor))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("editors create tasks with assignees; members cannot create", async () => {
    const { eventId, member, colleague, createTask } = await setup();

    const task = await createTask({ title: "Puerta", startTime: "15:00", assigneeIds: [colleague.id] });

    expect(task).toMatchObject({ title: "Puerta", startTime: "15:00", status: "pending" });
    expect(task.assignees.map((person) => person.userId)).toStrictEqual([colleague.id]);
    await expect(
      call(router.staffTasks.create, { eventId, title: "X", dayDate: DAY }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("#9 #13 an unknown assignee rejects the whole create, leaving no task behind", async () => {
    const { eventId, createTask } = await setup();

    await expect(createTask({ title: "Fantasma", assigneeIds: ["no-existe"] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(db.select().from(staffTasks).where(eq(staffTasks.openSpaceId, eventId))).resolves.toStrictEqual([]);
  });

  test("#10 only community members can be assigned", async () => {
    const { eventId, editor, outsider, createTask } = await setup();
    const task = await createTask();

    await expect(
      call(router.staffTasks.assign, { eventId, taskId: task.id, userId: outsider.id }, by(editor))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createTask({ assigneeIds: [outsider.id] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(router.staffTasks.update, { eventId, taskId: task.id, data: { assigneeIds: [outsider.id] } }, by(editor))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("editing a task keeps people who joined it without being on the roster", async () => {
    const { eventId, editor, colleague, createTask } = await setup();
    const siteStaff = await makeSiteAdmin();
    const task = await createTask();
    await call(router.staffTasks.join, { eventId, taskId: task.id }, by(siteStaff));

    const updated = await call(
      router.staffTasks.update,
      { eventId, taskId: task.id, data: { assigneeIds: [siteStaff.id, colleague.id] } },
      by(editor)
    );

    expect(updated.assignees.map((person) => person.userId).toSorted()).toStrictEqual(
      [siteStaff.id, colleague.id].toSorted()
    );
  });

  test("editors update a task and replace its assignees", async () => {
    const { eventId, editor, member, colleague, createTask } = await setup();
    const task = await createTask({ assigneeIds: [member.id] });

    const updated = await call(
      router.staffTasks.update,
      { eventId, taskId: task.id, data: { title: "Acreditación VIP", assigneeIds: [colleague.id] } },
      by(editor)
    );

    expect(updated.title).toBe("Acreditación VIP");
    expect(updated.assignees.map((person) => person.userId)).toStrictEqual([colleague.id]);
  });

  test("a task from another event is NOT_FOUND", async () => {
    const { editor, createTask } = await setup();
    const elsewhere = await setup();
    const task = await createTask();

    await expect(
      call(router.staffTasks.delete, { eventId: elsewhere.eventId, taskId: task.id }, by(elsewhere.editor))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.staffTasks.delete, { eventId: task.openSpaceId, taskId: task.id }, by(editor))
    ).resolves.toMatchObject({ id: task.id });
  });

  test("members set status, join and leave; the status records who changed it", async () => {
    const { eventId, member, createTask } = await setup();
    const task = await createTask();

    const done = await call(router.staffTasks.setStatus, { eventId, taskId: task.id, status: "done" }, by(member));
    const joined = await call(router.staffTasks.join, { eventId, taskId: task.id }, by(member));
    const left = await call(router.staffTasks.leave, { eventId, taskId: task.id }, by(member));

    expect(done).toMatchObject({ status: "done", statusUpdatedById: member.id });
    expect(joined.assignees.map((person) => person.userId)).toStrictEqual([member.id]);
    expect(left.assignees).toStrictEqual([]);
  });

  test("editors assign and unassign people", async () => {
    const { eventId, editor, colleague, createTask } = await setup();
    const task = await createTask();

    const assigned = await call(
      router.staffTasks.assign,
      { eventId, taskId: task.id, userId: colleague.id },
      by(editor)
    );
    const unassigned = await call(
      router.staffTasks.unassign,
      { eventId, taskId: task.id, userId: colleague.id },
      by(editor)
    );

    expect(assigned.assignees.map((person) => person.userId)).toStrictEqual([colleague.id]);
    expect(unassigned.assignees).toStrictEqual([]);
  });

  test("shiftFrom moves the day's timed tasks from a time on, and nothing earlier", async () => {
    const { eventId, editor, member, createTask } = await setup();
    await createTask({ title: "Antes", startTime: "14:00", endTime: "14:30" });
    await createTask({ title: "Desde", startTime: "15:00", endTime: "15:45" });
    await createTask({ title: "Después", startTime: "23:50", endTime: "23:55" });

    const { count } = await call(
      router.staffTasks.shiftFrom,
      { eventId, dayDate: DAY, fromTime: "15:00", deltaMinutes: 15 },
      by(editor)
    );
    const tasks = await call(router.staffTasks.list, { eventId }, by(member));

    expect(count).toBe(2);
    expect(tasks.map((task) => [task.title, task.startTime, task.endTime])).toStrictEqual([
      ["Antes", "14:00", "14:30"],
      ["Desde", "15:15", "16:00"],
      // Clamped to the end of the day rather than wrapping into tomorrow.
      ["Después", "23:59", "23:59"],
    ]);
  });

  test("#11 two shifts at once add up instead of overwriting each other", async () => {
    const { eventId, editor, member, createTask } = await setup();
    await createTask({ title: "Desde", startTime: "15:00", endTime: "15:30" });
    const shift = () =>
      call(router.staffTasks.shiftFrom, { eventId, dayDate: DAY, fromTime: "15:00", deltaMinutes: 15 }, by(editor));

    await Promise.all([shift(), shift()]);

    const [task] = await call(router.staffTasks.list, { eventId }, by(member));
    expect([task.startTime, task.endTime]).toStrictEqual(["15:30", "16:00"]);
  });

  test("changes ping the staff channel without their content", async () => {
    const { eventId, createTask } = await setup();
    const publish = vi.spyOn(hub, "publish");

    await createTask({ title: "Secreta" });

    expect(publish).toHaveBeenCalledWith(eventChannel(eventId, "staff"), "tasks_changed", {});
  });

  test("#16 the roster shows members to members without their emails", async () => {
    const { eventId, member } = await setup();

    const roster = await call(router.staffTasks.roster, { eventId }, by(member));

    expect(roster.length).toBeGreaterThan(0);
    expect(roster.every((person) => !("email" in person))).toBe(true);
  });
});

describe("staff announcements", () => {
  test("an editor announces to everyone; members see who is still pending and ack it", async () => {
    const { eventId, editor, member, colleague } = await setup();

    const { id } = await call(
      router.staffTasks.announcements.create,
      { eventId, body: "Arrancamos en 5", urgent: true },
      by(editor)
    );
    await call(router.staffTasks.announcements.ack, { eventId, announcementId: id }, by(member));
    const [announcement] = await call(router.staffTasks.announcements.list, { eventId }, by(colleague));

    expect(announcement).toMatchObject({ id, body: "Arrancamos en 5", urgent: true, audience: "all", ackCount: 1 });
    expect(announcement.author?.id).toBe(editor.id);
    expect(announcement.acks.map((ack) => ack.userId)).toStrictEqual([member.id]);
    // The author is not waiting to read their own message.
    expect(announcement.pending.map((person) => person.userId)).toStrictEqual([colleague.id]);
  });

  test("members cannot announce", async () => {
    const { eventId, member } = await setup();

    await expect(
      call(router.staffTasks.announcements.create, { eventId, body: "Hola" }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("#P3 a task announcement without a task is a BAD_REQUEST", async () => {
    const { eventId, editor } = await setup();

    await expect(
      call(router.staffTasks.announcements.create, { eventId, body: "Para la tarea", audience: "task" }, by(editor))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
