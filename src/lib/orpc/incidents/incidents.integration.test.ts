import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by, type RouterInputs } from "test/context";
import { makeBoard, makeMember, makeSiteAdmin, makeUser, type UserRow } from "test/factories";

type CreateInput = RouterInputs["incidents"]["create"];

/** A data URL of `bytes` bytes; the server checks the envelope and the size, not the pixels. */
const jpeg = (bytes: number) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;

async function setup() {
  const board = await makeBoard();
  const [owner, admin, editor, reporter, colleague, outsider, staff] = await Promise.all([
    makeMember(board.community.id, "owner", { name: "Dueña" }),
    makeMember(board.community.id, "admin", { name: "Organizadora" }),
    makeMember(board.community.id, "editor", { name: "Editora" }),
    makeMember(board.community.id, "member", { name: "Reportera" }),
    makeMember(board.community.id, "member", { name: "Colega" }),
    makeUser({ name: "Afuera" }),
    makeSiteAdmin(),
  ]);
  const eventId = board.event.id;
  const report = (data: Partial<CreateInput> = {}, as: UserRow = reporter, apiKey = false) =>
    call(
      router.incidents.create,
      { eventId, title: "Proyector sin señal", severity: "medium", category: "technical", ...data },
      by(as, { apiKey })
    );
  const announcements = () => call(router.staffTasks.announcements.list, { eventId }, by(staff));

  return { ...board, eventId, owner, admin, editor, reporter, colleague, outsider, staff, report, announcements };
}

describe("reporting", () => {
  test("any member reports; the source says where it came from", async () => {
    const { eventId, rooms, reporter, staff, report } = await setup();

    const fromAdmin = await report({ roomId: rooms.plain.id, description: "No da imagen" });
    const fromPhone = await report({ title: "Falta agua", source: "phone", location: "Lobby" });
    const fromOwy = await report({ title: "Campera perdida", category: "lost", source: "phone" }, staff, true);

    expect(fromAdmin).toMatchObject({
      status: "open",
      source: "admin",
      room: { id: rooms.plain.id },
      reporter: { id: reporter.id },
      description: "No da imagen",
      notes: [],
    });
    expect(fromPhone).toMatchObject({ source: "phone", location: "Lobby", room: null });
    expect(fromOwy.source).toBe("owy");
    const listed = await call(router.incidents.list, { eventId }, by(reporter));
    expect(listed.map((incident) => incident.id).toSorted()).toStrictEqual(
      [fromAdmin.id, fromPhone.id, fromOwy.id].toSorted()
    );
  });

  test("people outside the community can't report or read", async () => {
    const { eventId, outsider, report } = await setup();

    await expect(report({}, outsider)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.incidents.list, { eventId }, by(outsider))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.incidents.list, { eventId }, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("a room from another event is refused", async () => {
    const { report } = await setup();
    const elsewhere = await makeBoard();

    await expect(report({ roomId: elsewhere.rooms.plain.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("a photo is kept with the report; lists only say there is one", async () => {
    const { eventId, reporter, report } = await setup();

    const withPhoto = await report({ photo: jpeg(1024) });

    expect(withPhoto).toMatchObject({ hasPhoto: true, photo: jpeg(1024) });
    const [listed] = await call(router.incidents.list, { eventId }, by(reporter));
    expect(listed).toMatchObject({ hasPhoto: true });
    expect(listed).not.toHaveProperty("photo");
  });

  test("the photo has to be a JPEG data URL of at most 400 KB", async () => {
    const { report } = await setup();

    await expect(report({ photo: jpeg(400 * 1024) })).resolves.toMatchObject({ hasPhoto: true });
    await expect(report({ photo: jpeg(401 * 1024) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(report({ photo: "data:image/png;base64,iVBORw0KGgo=" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(report({ photo: 'data:image/jpeg;base64,"><script>' })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("a high or critical incident alerts the staff with an urgent announcement; a medium one doesn't", async () => {
    const { rooms, report, announcements } = await setup();

    await report({ title: "Falta papel", severity: "medium" });
    await expect(announcements()).resolves.toStrictEqual([]);

    await report({ title: "Persona descompuesta", severity: "critical", category: "medical", roomId: rooms.plain.id });
    const [alert] = await announcements();
    expect(alert).toMatchObject({
      urgent: true,
      audience: "all",
      body: `Incidente: Persona descompuesta · ${rooms.plain.name}`,
    });
  });

  test("through Owy, one loud report per few minutes pages the staff; the next ones still reach them, calmly", async () => {
    const { eventId, staff, report, announcements } = await setup();

    await report({ title: "Incendio en el baño", severity: "critical" }, staff, true);
    await report({ title: "Otro incendio", severity: "critical" }, staff, true);
    await report({ title: "Y otro más", severity: "high", location: "Patio" }, staff, true);
    // A person in the admin isn't held back by the window.
    await report({ title: "Persona descompuesta", severity: "high" });

    expect((await announcements()).map((item) => [item.body, item.urgent]).toReversed()).toStrictEqual([
      ["Incidente: Incendio en el baño", true],
      ["Otro reporte por Owy: Otro incendio · revisalo en Incidentes", false],
      ["Otro reporte por Owy: Y otro más · Patio · revisalo en Incidentes", false],
      ["Incidente: Persona descompuesta", true],
    ]);
    await expect(call(router.incidents.list, { eventId }, by(staff))).resolves.toHaveLength(4);
  });

  test("a confidential report alerts without saying what happened", async () => {
    const { report, announcements } = await setup();

    await report({ title: "Acoso en la fila", severity: "high", category: "conduct", sensitive: true });

    const [alert] = await announcements();
    expect(alert).toMatchObject({
      urgent: true,
      body: "Hay un reporte confidencial; organizadores, revisen Incidentes",
    });
    expect(alert.body).not.toContain("Acoso");
  });

  test("every report pings the event's admin screens", async () => {
    const { eventId, report } = await setup();
    const publish = vi.spyOn(hub, "publish");

    await report();

    expect(publish).toHaveBeenCalledWith(`event:${eventId}:ops`, "incidents", expect.anything());
  });

  test("the list puts what's open first, the loudest on top, and what's resolved last", async () => {
    const { eventId, editor, report } = await setup();
    await report({ title: "Baja", severity: "low" });
    await report({ title: "Crítica", severity: "critical" });
    const done = await report({ title: "Resuelta", severity: "critical" });
    await report({ title: "Media", severity: "medium" });
    await call(router.incidents.update, { eventId, id: done.id, status: "resolved" }, by(editor));

    const list = await call(router.incidents.list, { eventId }, by(editor));

    expect(list.map((incident) => incident.title)).toStrictEqual(["Crítica", "Media", "Baja", "Resuelta"]);
  });
});

describe("confidential reports", () => {
  test("organizers, the reporter and the assignee see one; any other member doesn't", async () => {
    const { eventId, owner, admin, editor, reporter, colleague, staff, report } = await setup();
    const open = await report({ title: "Se cortó la luz" });
    const confidential = await report({ title: "Comentario ofensivo", category: "conduct", sensitive: true });
    await call(router.incidents.update, { eventId, id: confidential.id, assigneeId: editor.id }, by(admin));

    const seen = async (as: UserRow) =>
      (await call(router.incidents.list, { eventId }, by(as))).map((incident) => incident.title).toSorted();

    for (const allowed of [staff, owner, admin, reporter, editor]) {
      await expect(seen(allowed)).resolves.toStrictEqual(["Comentario ofensivo", "Se cortó la luz"]);
    }
    await expect(seen(colleague)).resolves.toStrictEqual(["Se cortó la luz"]);
    await expect(call(router.incidents.get, { eventId, id: confidential.id }, by(colleague))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      call(router.incidents.addNote, { eventId, id: confidential.id, body: "Lo vi yo" }, by(colleague))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.incidents.assignToMe, { eventId, id: confidential.id }, by(colleague))
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(call(router.incidents.get, { eventId, id: open.id }, by(colleague))).resolves.toMatchObject({
      title: "Se cortó la luz",
    });
  });

  test("the shell's incident badge counts only what the person can see", async () => {
    const { eventId, admin, colleague, report } = await setup();
    await report({ title: "Se cortó la luz" });
    await report({ title: "Comentario ofensivo", category: "conduct", sensitive: true });

    const badge = async (as: UserRow) => (await call(router.shell.status, { eventId }, by(as))).counts.openIncidents;

    await expect(badge(admin)).resolves.toBe(2);
    await expect(badge(colleague)).resolves.toBe(1);
  });

  test("the activity log never names a confidential report", async () => {
    const { eventId, admin, staff, report } = await setup();
    const confidential = await report({ title: "Comentario ofensivo", category: "conduct", sensitive: true });
    await call(router.incidents.update, { eventId, id: confidential.id, status: "resolved" }, by(admin));

    const lines = await call(router.activity.list, { eventId, entityId: confidential.id }, by(staff));

    expect(lines.map((line) => line.summary)).toStrictEqual([
      "actualizó un incidente confidencial",
      "reportó un incidente confidencial",
    ]);
  });
});

describe("following an incident", () => {
  test("every change is appended to the log, and resolving stamps when", async () => {
    const { eventId, editor, colleague, rooms, report } = await setup();
    const incident = await report();

    await call(
      router.incidents.update,
      { eventId, id: incident.id, assigneeId: colleague.id, severity: "high" },
      by(editor)
    );
    await call(router.incidents.addNote, { eventId, id: incident.id, body: "Voy con un adaptador" }, by(colleague));
    await call(router.incidents.update, { eventId, id: incident.id, roomId: rooms.tv.id }, by(editor));
    const resolved = await call(
      router.incidents.update,
      { eventId, id: incident.id, status: "resolved" },
      by(colleague)
    );

    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.notes.map((note) => [note.author?.id, note.body])).toStrictEqual([
      [editor.id, `asignó a ${colleague.name} · cambió la gravedad a alta`],
      [colleague.id, "Voy con un adaptador"],
      [editor.id, `lo movió a ${rooms.tv.name}`],
      [colleague.id, "cambió el estado a resuelto"],
    ]);

    const reopened = await call(router.incidents.update, { eventId, id: incident.id, status: "open" }, by(editor));
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.notes).toHaveLength(5);
  });

  test("notes are append-only: nothing edits or deletes them", async () => {
    const { eventId, colleague, report } = await setup();
    const incident = await report();

    await call(router.incidents.addNote, { eventId, id: incident.id, body: "Primera" }, by(colleague));
    const after = await call(router.incidents.addNote, { eventId, id: incident.id, body: "Segunda" }, by(colleague));

    expect(after.notes.map((note) => note.body)).toStrictEqual(["Primera", "Segunda"]);
    expect(Object.keys(router.incidents).filter((name) => /note/i.test(name))).toStrictEqual(["addNote"]);
  });

  test("a change that changes nothing writes nothing", async () => {
    const { eventId, editor, report } = await setup();
    const incident = await report();

    const same = await call(router.incidents.update, { eventId, id: incident.id, status: "open" }, by(editor));

    expect(same.notes).toStrictEqual([]);
  });

  test("editors manage; a member only takes it, and then moves its status", async () => {
    const { eventId, colleague, reporter, report } = await setup();
    const incident = await report();

    await expect(
      call(router.incidents.update, { eventId, id: incident.id, status: "resolved" }, by(reporter))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const taken = await call(router.incidents.assignToMe, { eventId, id: incident.id }, by(colleague));
    expect(taken).toMatchObject({ status: "in_progress", assignee: { id: colleague.id } });
    expect(taken.notes.at(-1)?.body).toBe("cambió el estado a en curso · se lo asignó");

    await expect(
      call(router.incidents.update, { eventId, id: incident.id, severity: "low" }, by(colleague))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.incidents.update, { eventId, id: incident.id, status: "resolved" }, by(colleague))
    ).resolves.toMatchObject({ status: "resolved" });
  });

  test("only the community's staff can be assigned", async () => {
    const { eventId, editor, outsider, report } = await setup();
    const incident = await report();

    await expect(
      call(router.incidents.update, { eventId, id: incident.id, assigneeId: outsider.id }, by(editor))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("escalating to critical alerts the staff like a new report", async () => {
    const { eventId, editor, rooms, report, announcements } = await setup();
    const incident = await report({ title: "Humo en la cocina", location: "Cocina" });
    await expect(announcements()).resolves.toStrictEqual([]);

    await call(router.incidents.update, { eventId, id: incident.id, severity: "critical" }, by(editor));
    await call(
      router.incidents.update,
      { eventId, id: incident.id, roomId: rooms.plain.id, severity: "high" },
      by(editor)
    );

    expect((await announcements()).map((item) => item.body)).toStrictEqual(["Incidente: Humo en la cocina · Cocina"]);
  });

  test("an incident of another event is not found", async () => {
    const { editor, report } = await setup();
    const incident = await report();
    const elsewhere = await setup();

    await expect(
      call(router.incidents.get, { eventId: elsewhere.eventId, id: incident.id }, by(elsewhere.editor))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.incidents.update, { eventId: elsewhere.eventId, id: incident.id, status: "resolved" }, by(editor))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("asking for staff", () => {
  test("a room's host asks for a hand: a calm announcement to everyone", async () => {
    const { eventId, rooms, colleague, announcements } = await setup();

    await call(router.incidents.requestStaff, { eventId, roomId: rooms.plain.id }, by(colleague));

    const [request] = await announcements();
    expect(request).toMatchObject({ urgent: false, audience: "all", body: `Se necesita ayuda en ${rooms.plain.name}` });
    expect(request.author?.id).toBe(colleague.id);
  });
});
