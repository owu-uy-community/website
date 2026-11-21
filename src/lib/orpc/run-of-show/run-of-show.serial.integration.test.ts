import { call } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { obsCommands, outboundMessages } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeMember, makeSiteAdmin, makeUser, type UserRow } from "test/factories";

/**
 * GO fires OBS cues, and the OBS rigs are global rows (their suites truncate them, which cascades
 * into the guion), so this suite runs one file at a time with them. The board's event is on
 * 2026-11-07 in Montevideo (UTC−3), from 14:30.
 */
async function setup() {
  await db.execute(
    sql`TRUNCATE obs_preset_items, obs_presets, obs_queue_items, obs_commands, obs_cues, obs_instances CASCADE`
  );
  const board = await makeBoard();
  const staff = await makeSiteAdmin({ name: "Mesa" });
  const add = (title: string, plannedStart: string, extra: { durationMin?: number; fixed?: boolean } = {}) =>
    call(router.runOfShow.create, { eventId: board.event.id, title, plannedStart, ...extra }, by(staff));

  return { ...board, staff, add };
}

const at = (iso: string) => vi.setSystemTime(new Date(iso));

const rows = async (eventId: string, actor: UserRow) =>
  (await call(router.runOfShow.list, { eventId }, by(actor))).moments.map((moment) => ({
    title: moment.title,
    state: moment.actualEnd ? "hecho" : moment.actualStart ? "en curso" : "pendiente",
    drift: moment.driftMin,
  }));

describe("runOfShow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Owy's Telegram isn't set up here: every message it tries fails, as it would unconfigured.
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  test("only site staff can read or run the guion, not even the community's owner", async () => {
    const { community, event } = await setup();
    const owner = await makeMember(community.id, "owner");
    const outsider = await makeUser();

    for (const actor of [owner, outsider]) {
      await expect(call(router.runOfShow.list, { eventId: event.id }, by(actor))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(call(router.runOfShow.go, { eventId: event.id }, by(actor))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(call(router.runOfShow.list, { eventId: event.id }, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("GO runs the day in order, and a double press is one GO", async () => {
    const { event, staff, add } = await setup();
    const doors = await add("Puertas", "14:30", { durationMin: 30 });
    const welcome = await add("Bienvenida", "15:00", { durationMin: 15 });
    await add("Mercado de ideas", "15:15", { durationMin: 45 });
    const go = () => call(router.runOfShow.go, { eventId: event.id }, by(staff));

    at("2026-11-07T17:34:00Z");
    await expect(go()).resolves.toMatchObject({ item: { id: doors.id, driftMin: 4 }, warnings: [], repeated: false });
    at("2026-11-07T17:34:00.400Z");
    await expect(go()).resolves.toMatchObject({ item: { id: doors.id }, repeated: true });
    at("2026-11-07T18:06:00Z");
    await expect(go()).resolves.toMatchObject({ item: { id: welcome.id, driftMin: 6 } });

    await expect(rows(event.id, staff)).resolves.toStrictEqual([
      { title: "Puertas", state: "hecho", drift: 4 },
      { title: "Bienvenida", state: "en curso", drift: 6 },
      { title: "Mercado de ideas", state: "pendiente", drift: null },
    ]);
  });

  test("undo puts the last GO back: the closed moment runs again, the started one waits", async () => {
    const { event, staff, add } = await setup();
    const doors = await add("Puertas", "14:30", { durationMin: 30 });
    await add("Bienvenida", "15:00", { durationMin: 15 });
    await add("Mercado de ideas", "15:15", { durationMin: 45 });
    at("2026-11-07T17:34:00Z");
    await call(router.runOfShow.go, { eventId: event.id }, by(staff));
    at("2026-11-07T18:06:00Z");
    await call(router.runOfShow.go, { eventId: event.id }, by(staff));

    await expect(call(router.runOfShow.undo, { eventId: event.id }, by(staff))).resolves.toMatchObject({
      item: { id: doors.id, actualEnd: null },
    });
    await expect(rows(event.id, staff)).resolves.toStrictEqual([
      { title: "Puertas", state: "en curso", drift: 4 },
      { title: "Bienvenida", state: "pendiente", drift: null },
      { title: "Mercado de ideas", state: "pendiente", drift: null },
    ]);
  });

  test("GO on what is already running does nothing", async () => {
    const { event, staff, add } = await setup();
    const only = await add("Despedida", "20:25", { durationMin: 15 });

    at("2026-11-07T23:25:00Z");
    await call(router.runOfShow.go, { eventId: event.id, itemId: only.id }, by(staff));
    at("2026-11-07T23:30:00Z");

    await expect(call(router.runOfShow.go, { eventId: event.id, itemId: only.id }, by(staff))).resolves.toMatchObject({
      item: { id: only.id, actualEnd: null },
    });
    await expect(rows(event.id, staff)).resolves.toStrictEqual([{ title: "Despedida", state: "en curso", drift: 0 }]);
  });

  test("the last GO closes the day, and then there is nothing left to GO", async () => {
    const { event, staff, add } = await setup();
    await add("Despedida", "20:25", { durationMin: 15 });
    at("2026-11-07T23:25:00Z");
    await call(router.runOfShow.go, { eventId: event.id }, by(staff));
    at("2026-11-07T23:41:00Z");

    await expect(call(router.runOfShow.go, { eventId: event.id }, by(staff))).resolves.toStrictEqual({
      item: null,
      warnings: [],
      repeated: false,
    });
    await expect(rows(event.id, staff)).resolves.toStrictEqual([{ title: "Despedida", state: "hecho", drift: 0 }]);
    at("2026-11-07T23:35:00Z");
    await expect(call(router.runOfShow.go, { eventId: event.id }, by(staff))).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  test("a GO fires the moment's cue; Owy failing to post doesn't take the GO back", async () => {
    const { event, staff, add } = await setup();
    const cue = await call(router.obsCue.create, { instanceId: 1, name: "Patio", obsScene: "Patio" }, by(staff));
    const coffee = await add("Coffee break", "18:25", { durationMin: 35 });
    await call(
      router.runOfShow.update,
      { eventId: event.id, itemId: coffee.id, data: { cueId: cue.id, owyMessage: "☕ Coffee break en el patio" } },
      by(staff)
    );

    at("2026-11-07T21:27:00Z");
    const { item, warnings } = await call(router.runOfShow.go, { eventId: event.id }, by(staff));

    expect(item).toMatchObject({ id: coffee.id, driftMin: 2, cue: { id: cue.id, name: "Patio", obsScene: "Patio" } });
    expect(warnings).toStrictEqual([
      "OBS no está conectado: la escena «Patio» no salió al aire",
      expect.stringMatching(/^Owy no pudo avisar: .*Telegram/),
    ]);
    await expect(
      db.select({ source: obsCommands.source, payload: obsCommands.payload }).from(obsCommands)
    ).resolves.toStrictEqual([{ source: `rundown:${coffee.id}`, payload: { sceneName: "Patio", cue: "Patio" } }]);
    await expect(rows(event.id, staff)).resolves.toStrictEqual([
      { title: "Coffee break", state: "en curso", drift: 2 },
    ]);
    // The failed message is in Comunicación's log, with why.
    await expect(
      db
        .select({ body: outboundMessages.body, status: outboundMessages.status })
        .from(outboundMessages)
        .where(eq(outboundMessages.eventId, event.id))
    ).resolves.toStrictEqual([{ body: "☕ Coffee break en el patio", status: "failed" }]);
  });

  test("Correr horarios moves flexible moments up to the next fixed start and says which now run into it", async () => {
    const { event, staff, add } = await setup();
    const block1 = await add("Bloque 1", "16:00", { durationMin: 25 });
    await add("Bloque 2", "16:30", { durationMin: 25 });
    const coffee = await add("Coffee break", "16:55", { durationMin: 5 });
    const talk = await add("Charla", "17:00", { durationMin: 40, fixed: true });
    await add("After", "17:40", { durationMin: 60 });
    at("2026-11-07T19:03:00Z");
    await call(router.runOfShow.go, { eventId: event.id }, by(staff));

    await expect(
      call(router.runOfShow.shift, { eventId: event.id, fromItemId: block1.id, minutes: 5 }, by(staff))
    ).resolves.toStrictEqual({
      moved: 2,
      collisions: [
        {
          momentId: coffee.id,
          title: "Coffee break",
          overMin: 5,
          fixed: { id: talk.id, title: "Charla", plannedStart: "17:00" },
        },
      ],
    });
    await expect(
      call(router.runOfShow.shift, { eventId: event.id, fromItemId: talk.id, minutes: 10 }, by(staff))
    ).resolves.toStrictEqual({ moved: 1, collisions: [] });

    const { moments } = await call(router.runOfShow.list, { eventId: event.id }, by(staff));
    expect(moments.map((moment) => [moment.title, moment.plannedStart])).toStrictEqual([
      ["Bloque 1", "16:00"],
      ["Bloque 2", "16:35"],
      ["Coffee break", "17:00"],
      ["Charla", "17:00"],
      ["After", "17:50"],
    ]);
  });

  test("a new moment lands where its time falls, and its owner has to be on the community's staff", async () => {
    const { community, event, staff, add } = await setup();
    const helper = await makeMember(community.id, "member");
    const outsider = await makeUser();
    await add("Puertas", "14:30");
    await add("Charla", "19:00");

    await expect(
      call(
        router.runOfShow.create,
        { eventId: event.id, title: "Sorteo", plannedStart: "18:00", ownerId: helper.id },
        by(staff)
      )
    ).resolves.toMatchObject({ position: 1, owner: { id: helper.id } });
    await expect(
      call(
        router.runOfShow.create,
        { eventId: event.id, title: "Otro", plannedStart: "18:30", ownerId: outsider.id },
        by(staff)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(rows(event.id, staff)).resolves.toMatchObject([
      { title: "Puertas" },
      { title: "Sorteo" },
      { title: "Charla" },
    ]);
  });

  test("importing builds a first guion from the board's time slots, only while it's empty", async () => {
    const { event, staff } = await setup();

    const { moments } = await call(router.runOfShow.importProgram, { eventId: event.id }, by(staff));

    expect(
      moments.map((moment) => [moment.title, moment.plannedStart, moment.durationMin, moment.fixed])
    ).toStrictEqual([
      ["Apertura y acreditación", "14:30", 30, false],
      ["Open space · Bloque", "15:00", 45, false],
      ["Open space · Bloque", "16:00", 45, false],
      ["Cierre", "20:15", 15, true],
    ]);
    await expect(call(router.runOfShow.importProgram, { eventId: event.id }, by(staff))).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
