import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { account, activity, staffTasks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { eventChannel } from "lib/realtime/channels";
import { hub } from "lib/realtime/hub";
import { by, type RouterInputs } from "test/context";
import { makeBoard, makeMember, makeSiteAdmin, makeUser } from "test/factories";
import { server } from "test/msw/server";

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

  test("an edit keeps who already read it, unless it asks everyone to read it again", async () => {
    const { eventId, editor, member, colleague } = await setup();
    const { id } = await call(router.staffTasks.announcements.create, { eventId, body: "Arrancamos en 5" }, by(editor));
    await call(router.staffTasks.announcements.ack, { eventId, announcementId: id }, by(member));
    const edit = { eventId, announcementId: id, urgent: true, audience: "all" as const };

    await call(router.staffTasks.announcements.update, { ...edit, body: "Arrancamos en 10" }, by(editor));
    const [typo] = await call(router.staffTasks.announcements.list, { eventId }, by(colleague));
    await call(
      router.staffTasks.announcements.update,
      { ...edit, body: "Arrancamos en el patio", reread: true },
      by(editor)
    );
    const [moved] = await call(router.staffTasks.announcements.list, { eventId }, by(colleague));

    expect(typo).toMatchObject({ body: "Arrancamos en 10", urgent: true, ackCount: 1 });
    expect(typo.editedAt).not.toBeNull();
    expect(moved).toMatchObject({ body: "Arrancamos en el patio", ackCount: 0 });
    expect(moved.pending.map((person) => person.userId).toSorted()).toStrictEqual([member.id, colleague.id].toSorted());
  });

  test("a deleted announcement is gone for everyone, with who read it", async () => {
    const { eventId, editor, member } = await setup();
    const { id } = await call(router.staffTasks.announcements.create, { eventId, body: "Se suspende" }, by(editor));
    await call(router.staffTasks.announcements.ack, { eventId, announcementId: id }, by(member));

    await call(router.staffTasks.announcements.delete, { eventId, announcementId: id }, by(editor));

    await expect(call(router.staffTasks.announcements.list, { eventId }, by(member))).resolves.toStrictEqual([]);
    await expect(
      call(router.staffTasks.announcements.ack, { eventId, announcementId: id }, by(member))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("members can't edit or delete an announcement, and another event's is NOT_FOUND", async () => {
    const { eventId, editor, member } = await setup();
    const other = await setup();
    const { id } = await call(router.staffTasks.announcements.create, { eventId, body: "Hola" }, by(editor));
    const edit = { announcementId: id, body: "Chau", urgent: false, audience: "all" as const };

    await expect(call(router.staffTasks.announcements.update, { ...edit, eventId }, by(member))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      call(router.staffTasks.announcements.delete, { eventId, announcementId: id }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.staffTasks.announcements.update, { ...edit, eventId: other.eventId }, by(other.editor))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.staffTasks.announcements.delete, { eventId: other.eventId, announcementId: id }, by(other.editor))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("the activity log", () => {
  test("task changes are written to the event's log, in Spanish and without their author", async () => {
    const { eventId, member, createTask } = await setup();
    const task = await createTask({ title: "Puerta" });

    await call(router.staffTasks.setStatus, { eventId, taskId: task.id, status: "done" }, by(member));

    const lines = await db.select().from(activity).where(eq(activity.entityId, task.id));
    expect(lines.map((line) => [line.verb, line.summary, line.actorId])).toStrictEqual(
      expect.arrayContaining([
        ["task.created", "agregó la tarea «Puerta»", expect.any(String)],
        ["task.done", "marcó «Puerta» como lista", member.id],
      ])
    );
  });
});

describe("arrivals", () => {
  test("«Llegué» marks you at the venue once; leaving and coming back are both kept", async () => {
    const { eventId, member } = await setup();
    const publish = vi.spyOn(hub, "publish");

    const first = await call(router.staffTasks.arrivals.arrive, { eventId }, by(member));
    const again = await call(router.staffTasks.arrivals.arrive, { eventId }, by(member));
    const gone = await call(router.staffTasks.arrivals.leave, { eventId }, by(member));
    const back = await call(router.staffTasks.arrivals.arrive, { eventId }, by(member));

    expect(first).toMatchObject({ userId: member.id, name: "Miembro", leftAt: null });
    expect([again.arrivedAt, Boolean(gone.leftAt), back.leftAt]).toStrictEqual([first.arrivedAt, true, null]);
    expect(publish).toHaveBeenCalledWith(eventChannel(eventId, "ops"), "arrivals", {});
    await expect(call(router.staffTasks.arrivals.list, { eventId }, by(member))).resolves.toHaveLength(1);
  });

  test("only editors mark someone else, and only people on the staff", async () => {
    const { eventId, editor, member, colleague, outsider } = await setup();

    await expect(
      call(router.staffTasks.arrivals.arrive, { eventId, userId: colleague.id }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.staffTasks.arrivals.arrive, { eventId, userId: outsider.id }, by(editor))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(router.staffTasks.arrivals.arrive, { eventId, userId: colleague.id }, by(editor))
    ).resolves.toMatchObject({ userId: colleague.id, name: "Colega" });
    await expect(call(router.staffTasks.arrivals.list, { eventId }, by(outsider))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("you can't leave before arriving", async () => {
    const { eventId, member } = await setup();

    await expect(call(router.staffTasks.arrivals.leave, { eventId }, by(member))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Todavía no marcaste tu llegada",
    });
  });
});

describe("no-shows", () => {
  test("an editor marks someone absent for a task, and editing the task keeps the mark", async () => {
    const { eventId, editor, member, colleague, createTask } = await setup();
    const task = await createTask({ assigneeIds: [member.id, colleague.id] });

    await call(router.staffTasks.setNoShow, { eventId, taskId: task.id, userId: member.id, noShow: true }, by(editor));
    const edited = await call(
      router.staffTasks.update,
      { eventId, taskId: task.id, data: { title: "Acreditación T2", assigneeIds: [member.id] } },
      by(editor)
    );

    expect(edited.assignees).toStrictEqual([expect.objectContaining({ userId: member.id, noShow: true })]);
  });

  test("members can't, and someone who isn't on the task is NOT_FOUND", async () => {
    const { eventId, editor, member, colleague, createTask } = await setup();
    const task = await createTask({ assigneeIds: [member.id] });

    await expect(
      call(router.staffTasks.setNoShow, { eventId, taskId: task.id, userId: member.id, noShow: true }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.staffTasks.setNoShow, { eventId, taskId: task.id, userId: colleague.id, noShow: true }, by(editor))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("on shift", () => {
  test("at 16:42 on the event's clock it counts who is on site, late and free", async () => {
    const { eventId, editor, member, colleague, community, createTask } = await setup();
    const late = await makeMember(community.id, "member", { name: "Tarde" });
    const absent = await makeMember(community.id, "member", { name: "Ausente" });
    const door = await createTask({
      title: "Puerta",
      startTime: "16:00",
      endTime: "17:30",
      assigneeIds: [member.id, late.id, absent.id],
    });
    await createTask({ title: "Cierre", startTime: "20:00", endTime: "21:00", assigneeIds: [colleague.id] });
    await call(router.staffTasks.setNoShow, { eventId, taskId: door.id, userId: absent.id, noShow: true }, by(editor));
    await call(router.staffTasks.arrivals.arrive, { eventId }, by(member));
    await call(router.staffTasks.arrivals.arrive, { eventId }, by(editor));
    // 16:42 in Montevideo (UTC−3); only the clock is faked, the database keeps real time.
    vi.useFakeTimers({ now: new Date("2026-11-07T19:42:00.000Z"), toFake: ["Date"] });

    const shift = await call(router.staffTasks.onShift, { eventId }, by(colleague));

    expect(shift).toMatchObject({ day: DAY, time: "16:42", expected: 4, onSite: 2, late: 1, free: 1 });
    expect(Object.fromEntries(shift.people.map((p) => [p.name, p.state]))).toStrictEqual({
      Colega: "away",
      Editora: "free",
      Miembro: "busy",
      Tarde: "late",
    });
  });
});

describe("Reenviar por Owy", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function withAnnouncement() {
    const setupResult = await setup();
    const { id } = await call(
      router.staffTasks.announcements.create,
      { eventId: setupResult.eventId, body: "Charlas en la Sala principal", urgent: true },
      by(setupResult.editor)
    );
    return { ...setupResult, announcementId: id };
  }

  test("without Owy's Slack token it says so instead of pretending", async () => {
    vi.stubEnv("OWY_SLACK_BOT_TOKEN", "");
    const { eventId, editor, announcementId } = await withAnnouncement();

    await expect(
      call(router.staffTasks.announcements.remind, { eventId, announcementId }, by(editor))
    ).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: "Owy no puede mandar mensajes directos: falta OWY_SLACK_BOT_TOKEN",
    });
  });

  test("DMs everyone still pending who has Slack, and names who couldn't get it", async () => {
    vi.stubEnv("OWY_SLACK_BOT_TOKEN", "xoxb-test");
    const { eventId, editor, member, colleague, community, announcementId } = await withAnnouncement();
    const reader = await makeMember(community.id, "member", { name: "Leyó" });
    const now = new Date();
    await db.insert(account).values({
      id: createId(),
      accountId: "U0MIEMBRO",
      providerId: "slack",
      userId: member.id,
      createdAt: now,
      updatedAt: now,
    });
    await call(router.staffTasks.announcements.ack, { eventId, announcementId }, by(reader));
    const sent: unknown[] = [];
    server.use(
      http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ ok: true });
      })
    );

    const result = await call(router.staffTasks.announcements.remind, { eventId, announcementId }, by(editor));

    expect(result.sent.map((person) => person.userId)).toStrictEqual([member.id]);
    expect(result.failed).toStrictEqual([
      expect.objectContaining({ userId: colleague.id, reason: "No tiene Slack vinculado" }),
    ]);
    expect(sent).toStrictEqual([
      {
        channel: "U0MIEMBRO",
        text: expect.stringMatching(/> Charlas en la Sala principal[\s\S]*\/mi-turno\?event=/),
        unfurl_links: false,
      },
    ]);
    await expect(
      call(router.staffTasks.announcements.remind, { eventId, announcementId }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Importar planilla", () => {
  const SHEET = [
    "Tarea\tTipo\tDía\tInicio\tFin\tMín\tLugar\tPersonas\tNotas",
    "Acreditación\ttarea\t7/11/2026\t14:00\t15:30\t2\tEntrada\tMiembro, Colega\tCon la lista",
    "Bienvenida\thito\t7/11/2026\t15:00\t\t\tCentro\t\t",
  ].join("\n");

  test("a dry run previews the rows, and the real run creates them with their people", async () => {
    const { eventId, editor, member, colleague } = await setup();

    const preview = await call(router.staffTasks.import, { eventId, tsv: SHEET, dryRun: true }, by(editor));
    const before = await call(router.staffTasks.list, { eventId }, by(member));
    const done = await call(router.staffTasks.import, { eventId, tsv: SHEET, dryRun: false }, by(editor));
    const tasks = await call(router.staffTasks.list, { eventId }, by(member));

    expect(preview).toMatchObject({
      created: 0,
      rows: [{ title: "Acreditación", errors: [] }, { title: "Bienvenida" }],
    });
    expect(before).toStrictEqual([]);
    expect(done.created).toBe(2);
    expect(
      tasks.map((task) => [task.title, task.type, task.startTime, task.assignees.map((a) => a.userId)])
    ).toStrictEqual([
      ["Acreditación", "task", "14:00", expect.arrayContaining([member.id, colleague.id])],
      ["Bienvenida", "milestone", "15:00", []],
    ]);
  });

  test("pasting the same sheet again creates nothing new", async () => {
    const { eventId, editor } = await setup();
    await call(router.staffTasks.import, { eventId, tsv: SHEET, dryRun: false }, by(editor));

    const again = await call(router.staffTasks.import, { eventId, tsv: SHEET, dryRun: false }, by(editor));

    expect(again.created).toBe(0);
    expect(again.rows.map((row) => row.duplicate)).toStrictEqual([true, true]);
  });

  test("a row with errors stops the whole import, and members can't import", async () => {
    const { eventId, editor, member } = await setup();
    const broken = `${SHEET}\nCierre\ttarea\t7/11/2026\t21:00\t20:00\t\t\tNadie\t`;

    await expect(
      call(router.staffTasks.import, { eventId, tsv: broken, dryRun: false }, by(editor))
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "La fila 4 tiene errores: corregila y volvé a pegar" });
    await expect(
      db
        .select()
        .from(staffTasks)
        .where(and(eq(staffTasks.openSpaceId, eventId), eq(staffTasks.title, "Acreditación")))
    ).resolves.toStrictEqual([]);
    await expect(
      call(router.staffTasks.import, { eventId, tsv: SHEET, dryRun: true }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("swaps", () => {
  const people = (task: { assignees: { userId: string }[] }) => task.assignees.map((person) => person.userId);

  test("an editor swaps two people between tasks, each in the other's place; the same call the other way swaps back", async () => {
    const { eventId, editor, member, colleague, createTask } = await setup();
    const montaje = await createTask({ title: "Montaje", startTime: "12:30", assigneeIds: [member.id] });
    await call(router.staffTasks.assign, { eventId, taskId: montaje.id, userId: editor.id }, by(editor));
    const puerta = await createTask({ title: "Puerta", startTime: "14:00", assigneeIds: [colleague.id] });
    const publish = vi.spyOn(hub, "publish");

    const [x, y] = await call(
      router.staffTasks.swapAssignees,
      { eventId, a: { taskId: montaje.id, userId: member.id }, b: { taskId: puerta.id, userId: colleague.id } },
      by(editor)
    );

    expect([people(x), people(y)]).toStrictEqual([[colleague.id, editor.id], [member.id]]);
    expect(publish).toHaveBeenCalledWith(eventChannel(eventId, "staff"), "tasks_changed", {});
    expect(publish).toHaveBeenCalledWith(eventChannel(eventId, "ops"), "activity", {});
    const [line] = await db.select().from(activity).where(eq(activity.verb, "task.people_swapped"));
    expect(line).toMatchObject({ entityId: montaje.id, summary: "intercambió a Miembro (Montaje) y Colega (Puerta)" });

    const [puertaAgain, montajeAgain] = await call(
      router.staffTasks.swapAssignees,
      { eventId, a: { taskId: puerta.id, userId: member.id }, b: { taskId: montaje.id, userId: colleague.id } },
      by(editor)
    );
    expect([people(montajeAgain), people(puertaAgain)]).toStrictEqual([[member.id, editor.id], [colleague.id]]);
  });

  test("two swaps of the same people at once: one lands, the other says they already moved", async () => {
    const { eventId, editor, member, colleague, createTask } = await setup();
    const montaje = await createTask({ title: "Montaje", assigneeIds: [member.id] });
    const puerta = await createTask({ title: "Puerta", assigneeIds: [colleague.id] });
    const swap = () =>
      call(
        router.staffTasks.swapAssignees,
        { eventId, a: { taskId: montaje.id, userId: member.id }, b: { taskId: puerta.id, userId: colleague.id } },
        by(editor)
      );

    const results = await Promise.allSettled([swap(), swap()]);

    expect(results.map((result) => result.status).toSorted()).toStrictEqual(["fulfilled", "rejected"]);
    const tasks = await call(router.staffTasks.list, { eventId }, by(member));
    expect(tasks.map(people)).toStrictEqual([[colleague.id], [member.id]]);
  });

  test("a swap that makes no sense says why, and changes nothing", async () => {
    const { eventId, editor, member, colleague, createTask } = await setup();
    const montaje = await createTask({ title: "Montaje", assigneeIds: [member.id, colleague.id] });
    const puerta = await createTask({ title: "Puerta", assigneeIds: [colleague.id] });
    const swap = (a: string, aTask: string, b: string, bTask: string) =>
      call(
        router.staffTasks.swapAssignees,
        { eventId, a: { taskId: aTask, userId: a }, b: { taskId: bTask, userId: b } },
        by(editor)
      );

    await expect(swap(member.id, montaje.id, colleague.id, montaje.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Están en la misma tarea: no hay nada que intercambiar",
    });
    await expect(swap(member.id, montaje.id, colleague.id, puerta.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Colega ya está en «Montaje»",
    });
    await expect(swap(editor.id, montaje.id, colleague.id, puerta.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Esa persona ya no está en «Montaje»",
    });
    const tasks = await call(router.staffTasks.list, { eventId }, by(member));
    expect(tasks.map((task) => people(task).toSorted())).toStrictEqual([
      [member.id, colleague.id].toSorted(),
      [colleague.id],
    ]);
  });

  test("moving someone to another task, never onto a milestone or a task they're already on", async () => {
    const { eventId, editor, member, colleague, createTask } = await setup();
    const montaje = await createTask({ title: "Montaje", startTime: "12:30", assigneeIds: [member.id] });
    const puerta = await createTask({ title: "Puerta", startTime: "14:00", assigneeIds: [colleague.id] });
    const apertura = await createTask({ title: "Apertura", type: "milestone", startTime: "14:30" });
    const move = (toTaskId: string) =>
      call(router.staffTasks.moveAssignee, { eventId, taskId: montaje.id, userId: member.id, toTaskId }, by(editor));

    await expect(move(apertura.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Un hito no lleva personas",
    });
    await expect(move(montaje.id)).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Ya está en esa tarea" });
    const [from, to] = await move(puerta.id);

    expect([people(from), people(to).toSorted()]).toStrictEqual([[], [member.id, colleague.id].toSorted()]);
    const [line] = await db.select().from(activity).where(eq(activity.verb, "task.person_moved"));
    expect(line.summary).toBe("pasó a Miembro de «Montaje» a «Puerta»");
  });

  test("two tasks trade their day and times; a milestone only with another milestone", async () => {
    const { eventId, editor, createTask } = await setup();
    const montaje = await createTask({ title: "Montaje", dayDate: "2026-11-06", startTime: "18:00", endTime: "20:00" });
    const puerta = await createTask({ title: "Puerta", startTime: "14:00" });
    const apertura = await createTask({ title: "Apertura", type: "milestone", startTime: "14:30" });
    const swap = (otherTaskId: string) =>
      call(router.staffTasks.swapTimes, { eventId, taskId: montaje.id, otherTaskId }, by(editor));

    const [x, y] = await swap(puerta.id);

    expect([x.dayDate, x.startTime, x.endTime]).toStrictEqual([DAY, "14:00", null]);
    expect([y.dayDate, y.startTime, y.endTime]).toStrictEqual(["2026-11-06", "18:00", "20:00"]);
    const [line] = await db.select().from(activity).where(eq(activity.verb, "task.times_swapped"));
    expect(line.summary).toBe("intercambió el horario de «Montaje» y «Puerta»");
    await expect(swap(apertura.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Un hito solo cambia de horario con otro hito",
    });
    const [again] = await swap(puerta.id);
    expect([again.dayDate, again.startTime, again.endTime]).toStrictEqual(["2026-11-06", "18:00", "20:00"]);
  });

  test("members can't swap, and tasks from another event are not found", async () => {
    const { eventId, member, colleague, editor, createTask } = await setup();
    const elsewhere = await setup();
    const mine = await createTask({ title: "Montaje", assigneeIds: [member.id] });
    const theirs = await elsewhere.createTask({ title: "Ajena", assigneeIds: [elsewhere.member.id] });
    const other = await createTask({ title: "Puerta", assigneeIds: [colleague.id] });

    await expect(
      call(
        router.staffTasks.swapAssignees,
        { eventId, a: { taskId: mine.id, userId: member.id }, b: { taskId: other.id, userId: colleague.id } },
        by(member)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.staffTasks.swapTimes, { eventId, taskId: mine.id, otherTaskId: other.id }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.staffTasks.swapTimes, { eventId, taskId: mine.id, otherTaskId: theirs.id }, by(editor))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
