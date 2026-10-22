import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { activity } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { decidingModel, models } from "test/ai";
import { by } from "test/context";
import { makeBoard, makeSiteAdmin, makeTrack, makeServiceAccount } from "test/factories";

/** The board (two rooms, blocks at 15:00 and 16:00), a staffer, and the event's talk log. */
async function setup() {
  const board = await makeBoard();
  const staff = await makeSiteAdmin({ name: "Laura Staff" });
  const log = (entityId?: string) =>
    call(router.activity.list, { eventId: board.event.id, entityType: "track", entityId }, by(staff));
  const place = (slot: { id: string }, room: { id: string }) => ({
    openSpaceId: board.event.id,
    scheduleId: slot.id,
    roomId: room.id,
  });
  const at = (slot: { id: string }, room: { id: string }) => ({
    eventId: board.event.id,
    scheduleId: slot.id,
    roomId: room.id,
  });

  return { ...board, staff, log, place, at };
}

const newTalk = { needsTV: false, needsWhiteboard: false, skipResourceValidation: false };

/**
 * How many log lines the event had each time its admin screens were pinged. A ping sent before
 * the commit would find its own line missing (another connection can't see it yet).
 */
function linesAtEachPing(eventId: string) {
  const seen: number[] = [];
  vi.spyOn(hub, "publish").mockImplementation(async (channel, event) => {
    if (channel === `event:${eventId}:ops` && event === "activity") {
      seen.push((await db.select().from(activity).where(eq(activity.eventId, eventId))).length);
    }
  });

  return seen;
}

describe("the talks' activity log", () => {
  test("a new talk logs who put it where, and the admin screens hear it once it is committed", async () => {
    const { event, rooms, slots, staff, log, place } = await setup();
    const pings = linesAtEachPing(event.id);

    const note = await call(
      router.tracks.create,
      { ...newTalk, title: "Postgres", ...place(slots.early, rooms.plain) },
      by(staff)
    );

    await expect(log(note.id)).resolves.toMatchObject([
      {
        verb: "track.created",
        entityType: "track",
        entityId: note.id,
        summary: `agregó «Postgres» en ${rooms.plain.name} · 15:00`,
        actor: { id: staff.id, name: "Laura Staff" },
      },
    ]);
    expect(pings).toStrictEqual([1]);
  });

  test("a talk read off a card photo says so; one brought back with Deshacer is a restore", async () => {
    const { rooms, slots, staff, log, place } = await setup();

    const photo = await call(
      router.tracks.create,
      { ...newTalk, title: "Foto", origin: "photo", ...place(slots.early, rooms.plain) },
      by(staff)
    );
    const undone = await call(
      router.tracks.create,
      { ...newTalk, title: "Vuelve", origin: "undo", ...place(slots.late, rooms.plain) },
      by(staff)
    );

    expect((await log(photo.id))[0].summary).toBe(`agregó «Foto» en ${rooms.plain.name} · 15:00 desde una foto`);
    await expect(log(undone.id)).resolves.toMatchObject([
      { verb: "track.restored", summary: `restauró «Vuelve» en ${rooms.plain.name} · 16:00` },
    ]);
  });

  test("a move names the new place, an edit the talk, and a save that changes nothing logs nothing", async () => {
    const { event, rooms, slots, staff, log, at } = await setup();
    const talk = await makeTrack(at(slots.early, rooms.plain), { title: "Effect", speaker: "Ana" });
    const pings = linesAtEachPing(event.id);

    await call(
      router.tracks.update,
      { id: talk.id, data: { scheduleId: slots.late.id, roomId: rooms.tv.id } },
      by(staff)
    );
    await call(router.tracks.update, { id: talk.id, data: { title: "Effect en serio" } }, by(staff));
    await call(router.tracks.update, { id: talk.id, data: { title: "Effect en serio", speaker: "Ana" } }, by(staff));

    expect((await log(talk.id)).map(({ verb, summary }) => [verb, summary])).toStrictEqual([
      ["track.updated", "editó «Effect en serio»"],
      ["track.moved", `movió «Effect» a ${rooms.tv.name} · 16:00`],
    ]);
    expect(pings).toStrictEqual([1, 2]);
  });

  test("editing and moving in one save is one line", async () => {
    const { rooms, slots, staff, log, at } = await setup();
    const talk = await makeTrack(at(slots.early, rooms.plain), { title: "Effect" });

    await call(
      router.tracks.update,
      { id: talk.id, data: { title: "Effect 4", scheduleId: slots.late.id, needsTV: true, roomId: rooms.tv.id } },
      by(staff)
    );

    expect((await log(talk.id)).map(({ summary }) => summary)).toStrictEqual([
      `editó y movió «Effect 4» a ${rooms.tv.name} · 16:00`,
    ]);
  });

  test("a delete keeps the talk's title in the log", async () => {
    const { rooms, slots, staff, log, at } = await setup();
    const talk = await makeTrack(at(slots.early, rooms.plain), { title: "Se va" });

    await call(router.tracks.delete, { id: talk.id }, by(staff));

    await expect(log(talk.id)).resolves.toMatchObject([{ verb: "track.deleted", summary: "borró «Se va»" }]);
  });

  test("a swap is one line for the gesture, filed under the first talk", async () => {
    const { event, rooms, slots, staff, log, at } = await setup();
    const a = await makeTrack(at(slots.early, rooms.plain), { title: "Arriba" });
    const b = await makeTrack(at(slots.late, rooms.tv), { title: "Abajo" });
    const pings = linesAtEachPing(event.id);

    await call(router.tracks.swap, { trackAId: a.id, trackBId: b.id }, by(staff));

    expect((await log()).map(({ verb, entityId, summary }) => [verb, entityId, summary])).toStrictEqual([
      ["track.swapped", a.id, "intercambió «Arriba» y «Abajo»"],
    ]);
    expect(pings).toStrictEqual([1]);
  });

  test("a block that moves logs one line for the block, not one per talk", async () => {
    const { event, rooms, slots, staff, at } = await setup();
    await makeTrack(at(slots.early, rooms.plain), { title: "Uno" });
    await makeTrack(at(slots.early, rooms.tv), { title: "Dos" });

    await call(
      router.tracks.bulkUpdateBySchedule,
      { scheduleId: slots.early.id, newTimeSlot: "14:30 - 15:15" },
      by(staff)
    );

    const lines = await call(router.activity.list, { eventId: event.id }, by(staff));
    expect(lines.map(({ verb, entityType, entityId, summary }) => [verb, entityType, entityId, summary])).toStrictEqual(
      [["schedule.moved", "schedule", slots.early.id, "movió 2 charlas a las 14:30"]]
    );
  });

  test("a place lost to someone faster leaves no line behind", async () => {
    const { rooms, slots, staff, log, place } = await setup();
    const attempts = Array.from({ length: 6 }, (_, index) =>
      call(router.tracks.create, { ...newTalk, title: `Charla ${index}`, ...place(slots.late, rooms.plain) }, by(staff))
    );

    const results = await Promise.allSettled(attempts);

    // The losers still learn who got there first: the rollback must not break that answer.
    expect(
      results
        .map((result) => (result.status === "fulfilled" ? "OK" : (result.reason as { code: string }).code))
        .toSorted()
    ).toStrictEqual(["CONFLICT", "CONFLICT", "CONFLICT", "CONFLICT", "CONFLICT", "OK"]);
    await expect(log()).resolves.toHaveLength(1);
  });

  test("a talk Owy places from a spoken pitch is logged as Owy's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T12:00:00.000Z"));
    const { event, log } = await setup();
    const owy = await makeServiceAccount({ name: "Owy" });

    const placed = await call(
      router.tracks.createPlaced,
      { openSpaceId: event.id, title: "Postgres sin miedo", source: "companion" },
      by(owy, { apiKey: true, ai: models({ pick: decidingModel() }) })
    );

    await expect(log(placed.note.id)).resolves.toMatchObject([
      {
        verb: "track.created",
        summary: `agregó «Postgres sin miedo» en ${placed.note.room} · ${placed.note.timeSlot.slice(0, 5)}`,
        actor: { id: owy.id, name: "Owy" },
      },
    ]);
  });
});
