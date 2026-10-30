import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { tracks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by } from "test/context";
import { makeBoard, makeMember, makeRoom, makeSiteAdmin, makeSlot, makeTrack } from "test/factories";

async function setup() {
  const board = await makeBoard();
  const staff = await makeSiteAdmin();
  const place = (slot: { id: string }, room: { id: string }) => ({
    openSpaceId: board.event.id,
    scheduleId: slot.id,
    roomId: room.id,
  });

  return { ...board, staff, place };
}

const newTalk = { needsTV: false, needsWhiteboard: false, skipResourceValidation: false };

describe("tracks reads", () => {
  test("list returns the board's notes with readable room and time slot", async () => {
    const { event, rooms, slots } = await setup();
    await makeTrack(
      { eventId: event.id, scheduleId: slots.early.id, roomId: rooms.tv.id },
      { title: "Effect", speaker: "Ana" }
    );

    const notes = await call(router.tracks.list, { openSpaceId: event.id }, by(null));

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      title: "Effect",
      speaker: "Ana",
      room: rooms.tv.name,
      roomColor: undefined,
      timeSlot: "15:00 - 15:45",
    });
  });

  test("getByOpenSpace can narrow to slots highlighted on the kiosk", async () => {
    const { event, rooms, slots } = await setup();
    const highlighted = await makeSlot(event.id, { startTime: "18:00", endTime: "18:45", highlightInKiosk: true });
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id }, { title: "Normal" });
    await makeTrack({ eventId: event.id, scheduleId: highlighted.id, roomId: rooms.plain.id }, { title: "Destacada" });

    const all = await call(router.tracks.getByOpenSpace, { openSpaceId: event.id }, by(null));
    const onlyHighlighted = await call(
      router.tracks.getByOpenSpace,
      { openSpaceId: event.id, highlightedOnly: true },
      by(null)
    );

    expect(all.map((track) => track.title)).toStrictEqual(["Normal", "Destacada"]);
    expect(onlyHighlighted.map((track) => track.title)).toStrictEqual(["Destacada"]);
  });

  test("getByOpenSpace leaves out talks in rooms switched off", async () => {
    const { event, rooms, slots } = await setup();
    const hidden = await makeRoom(event.id, { isActive: false });
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id }, { title: "Visible" });
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: hidden.id }, { title: "Oculta" });

    const feed = await call(router.tracks.getByOpenSpace, { openSpaceId: event.id }, by(null));

    expect(feed.map((track) => track.title)).toStrictEqual(["Visible"]);
  });

  test("get returns one note; an unknown id is NOT_FOUND", async () => {
    const { event, rooms, slots } = await setup();
    const talk = await makeTrack({ eventId: event.id, scheduleId: slots.late.id, roomId: rooms.plain.id });

    await expect(call(router.tracks.get, { id: talk.id }, by(null))).resolves.toMatchObject({
      id: talk.id,
      timeSlot: "16:00 - 16:45",
    });
    await expect(call(router.tracks.get, { id: "no-existe" }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("tracks.create", () => {
  test("site staff places a talk on a free slot and the board is told", async () => {
    const { rooms, slots, staff, place } = await setup();
    const publish = vi.spyOn(hub, "publish");

    const note = await call(
      router.tracks.create,
      { ...newTalk, title: "Postgres", ...place(slots.early, rooms.plain) },
      by(staff)
    );

    expect(note).toMatchObject({ title: "Postgres", room: rooms.plain.name, timeSlot: "15:00 - 15:45" });
    expect(publish).toHaveBeenCalledWith(
      `event:${note.openSpaceId}:sync`,
      "card_change",
      expect.objectContaining({ type: "CARD_CREATE", payload: expect.objectContaining({ cardId: note.id }) })
    );
  });

  test("a taken slot is a CONFLICT that names the talk sitting there", async () => {
    const { event, rooms, slots, staff, place } = await setup();
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id }, { title: "Primera" });

    await expect(
      call(router.tracks.create, { ...newTalk, title: "Segunda", ...place(slots.early, rooms.plain) }, by(staff))
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "slot_taken", occupiedBy: "Primera" } });
  });

  test("a talk that needs a TV is refused in a room without one, unless the staffer insists", async () => {
    const { rooms, slots, staff, place } = await setup();
    const input = { ...newTalk, title: "Demo", needsTV: true, ...place(slots.early, rooms.plain) };

    await expect(call(router.tracks.create, input, by(staff))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(router.tracks.create, { ...input, skipResourceValidation: true }, by(staff))
    ).resolves.toMatchObject({ title: "Demo", needsTV: true });
  });

  test("only site staff may place talks", async () => {
    const { community, rooms, slots, place } = await setup();
    const editor = await makeMember(community.id, "editor");
    const input = { ...newTalk, title: "Intento", ...place(slots.early, rooms.plain) };

    await expect(call(router.tracks.create, input, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(call(router.tracks.create, input, by(editor))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("#5 two staffers grabbing the same slot at once: one wins, the rest get CONFLICT", async () => {
    const { rooms, slots, staff, place } = await setup();
    const attempts = Array.from({ length: 8 }, (_, index) =>
      call(router.tracks.create, { ...newTalk, title: `Charla ${index}`, ...place(slots.late, rooms.plain) }, by(staff))
    );

    const results = await Promise.allSettled(attempts);
    const codes = results.map((result) =>
      result.status === "fulfilled" ? "OK" : (result.reason as { code: string }).code
    );

    expect(codes.filter((code) => code === "OK")).toHaveLength(1);
    expect(codes.filter((code) => code !== "OK")).toStrictEqual(Array.from({ length: 7 }, () => "CONFLICT"));
  });

  test("#6 a room from another event is a BAD_REQUEST", async () => {
    const { slots, staff, place } = await setup();
    const elsewhere = await makeBoard();

    await expect(
      call(
        router.tracks.create,
        { ...newTalk, title: "Cruzada", ...place(slots.early, elsewhere.rooms.plain) },
        by(staff)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("tracks.update", () => {
  test("moves a talk to a free slot", async () => {
    const { event, rooms, slots, staff } = await setup();
    const talk = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });

    const moved = await call(
      router.tracks.update,
      { id: talk.id, data: { scheduleId: slots.late.id, roomId: rooms.tv.id } },
      by(staff)
    );

    expect(moved).toMatchObject({ id: talk.id, scheduleId: slots.late.id, room: rooms.tv.name });
  });

  test("moving onto a taken slot is a CONFLICT", async () => {
    const { event, rooms, slots, staff } = await setup();
    const mover = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });
    await makeTrack({ eventId: event.id, scheduleId: slots.late.id, roomId: rooms.plain.id }, { title: "Ocupante" });

    await expect(
      call(router.tracks.update, { id: mover.id, data: { scheduleId: slots.late.id } }, by(staff))
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "slot_taken", occupiedBy: "Ocupante" } });
  });

  test("#6 moving a talk into another event's slot is a BAD_REQUEST", async () => {
    const { event, rooms, slots, staff } = await setup();
    const talk = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });
    const elsewhere = await makeBoard();

    await expect(
      call(router.tracks.update, { id: talk.id, data: { scheduleId: elsewhere.slots.early.id } }, by(staff))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("tracks.delete", () => {
  test("removes the talk", async () => {
    const { event, rooms, slots, staff } = await setup();
    const talk = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });

    await call(router.tracks.delete, { id: talk.id }, by(staff));

    await expect(db.select().from(tracks).where(eq(tracks.id, talk.id))).resolves.toStrictEqual([]);
  });
});

describe("tracks.swap", () => {
  test("two talks trade places", async () => {
    const { event, rooms, slots, staff } = await setup();
    const a = await makeTrack(
      { eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id },
      { title: "A" }
    );
    const b = await makeTrack({ eventId: event.id, scheduleId: slots.late.id, roomId: rooms.tv.id }, { title: "B" });

    await call(router.tracks.swap, { trackAId: a.id, trackBId: b.id }, by(staff));

    const placed = await db.select().from(tracks).where(eq(tracks.openSpaceId, event.id));
    expect(new Map(placed.map((t) => [t.title, [t.scheduleId, t.roomId]]))).toStrictEqual(
      new Map([
        ["A", [slots.late.id, rooms.tv.id]],
        ["B", [slots.early.id, rooms.plain.id]],
      ])
    );
  });

  test("swapping a talk with itself is a BAD_REQUEST", async () => {
    const { event, rooms, slots, staff } = await setup();
    const a = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });

    await expect(call(router.tracks.swap, { trackAId: a.id, trackBId: a.id }, by(staff))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("#6 swapping talks from different events is a BAD_REQUEST", async () => {
    const { event, rooms, slots, staff } = await setup();
    const elsewhere = await makeBoard();
    const mine = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });
    const theirs = await makeTrack({
      eventId: elsewhere.event.id,
      scheduleId: elsewhere.slots.early.id,
      roomId: elsewhere.rooms.plain.id,
    });

    await expect(call(router.tracks.swap, { trackAId: mine.id, trackBId: theirs.id }, by(staff))).rejects.toMatchObject(
      { code: "BAD_REQUEST" }
    );
  });
});

describe("tracks.bulkUpdateBySchedule", () => {
  test("re-labels every talk of a slot with the new time", async () => {
    const { event, rooms, slots, staff } = await setup();
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id }, { title: "Uno" });
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.tv.id }, { title: "Dos" });

    const notes = await call(
      router.tracks.bulkUpdateBySchedule,
      { scheduleId: slots.early.id, newTimeSlot: "14:30 - 15:15" },
      by(staff)
    );

    expect(notes.map((note) => [note.title, note.timeSlot]).toSorted(([a], [b]) => a.localeCompare(b))).toStrictEqual([
      ["Dos", "14:30 - 15:15"],
      ["Uno", "14:30 - 15:15"],
    ]);
  });

  test("#5 moving a slot's talks onto a slot with a talk in the same room is a CONFLICT", async () => {
    const { event, rooms, slots, staff } = await setup();
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });
    await makeTrack({ eventId: event.id, scheduleId: slots.late.id, roomId: rooms.plain.id });

    await expect(
      call(
        router.tracks.bulkUpdateBySchedule,
        { scheduleId: slots.early.id, newTimeSlot: "16:00 - 16:45", newScheduleId: slots.late.id },
        by(staff)
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
