import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { tracks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { decidingModel, downDecisionModel, models } from "test/ai";
import { by } from "test/context";
import { makeBoard, makeMember, makeSiteAdmin, makeSlot, makeTrack } from "test/factories";

/**
 * The companion's spoken pitch: place and create in one call. The board has
 * two rooms (plain, TV+whiteboard) and two blocks (15:00, 16:00); the clock
 * sits before both so neither is dropped as already ended.
 */
async function setup() {
  const board = await makeBoard();
  const staff = await makeSiteAdmin();
  const at = (slot: { id: string }, room: { id: string }) => ({
    eventId: board.event.id,
    scheduleId: slot.id,
    roomId: room.id,
  });
  const pitch = { openSpaceId: board.event.id, title: "Postgres sin miedo", description: "Índices y planes" };

  return { ...board, staff, at, pitch };
}

describe("tracks.createPlaced", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T12:00:00.000Z"));
  });

  test("places the talk where the model says and tells the board once", async () => {
    const { event, rooms, slots, staff, at, pitch } = await setup();
    await makeTrack(at(slots.early, rooms.plain), { title: "Effect" });
    const pick = decidingModel(() => 0.1);
    const publish = vi.spyOn(hub, "publish");

    const placed = await call(router.tracks.createPlaced, pitch, by(staff, { ai: models({ pick }) }));

    // The emptier block first, the thriftiest room first.
    expect(placed.note).toMatchObject({
      title: "Postgres sin miedo",
      room: rooms.plain.name,
      timeSlot: "16:00 - 16:45",
    });
    expect(placed.placement).toStrictEqual({
      room: rooms.plain.name,
      timeSlot: "16:00 - 16:45",
      reasoning: expect.any(String),
      degraded: false,
      missing: [],
      skipped: [],
    });
    expect(pick.calls).toHaveLength(1);
    expect(
      publish.mock.calls.filter(([channel, name]) => channel === `event:${event.id}:sync` && name === "card_change")
    ).toHaveLength(1);
  });

  test("a cell taken while the model was thinking falls through to the next one", async () => {
    const { rooms, slots, staff, at, pitch } = await setup();
    await makeTrack(at(slots.early, rooms.plain), { title: "Effect" });
    const pick = decidingModel(() => 0.1);
    const decide = pick.doDecide.bind(pick);
    pick.doDecide = async (options) => {
      await makeTrack(at(slots.late, rooms.plain), { title: "Colada" });

      return decide(options);
    };

    const placed = await call(router.tracks.createPlaced, pitch, by(staff, { ai: models({ pick }) }));

    expect(placed.note.timeSlot).toBe("16:00 - 16:45");
    expect(placed.note.room).toBe(rooms.tv.name);
    expect(placed.placement.skipped).toStrictEqual([
      { room: rooms.plain.name, timeSlot: "16:00 - 16:45", occupiedBy: "Colada" },
    ]);
  });

  test("a full board is a CONFLICT board_full, and no model is paid", async () => {
    const { event, rooms, slots, staff, at, pitch } = await setup();
    for (const slot of [slots.early, slots.late]) {
      for (const room of [rooms.plain, rooms.tv]) await makeTrack(at(slot, room));
    }
    const pick = decidingModel();

    await expect(call(router.tracks.createPlaced, pitch, by(staff, { ai: models({ pick }) }))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "board_full" },
    });
    expect(pick.calls).toHaveLength(0);
    await expect(db.select().from(tracks).where(eq(tracks.openSpaceId, event.id))).resolves.toHaveLength(4);
  });

  test("with the models down the talk still lands, flagged as degraded", async () => {
    const { rooms, slots, staff, at, pitch } = await setup();
    // Something to compare against, so the model is actually consulted.
    await makeTrack(at(slots.early, rooms.plain), { title: "Effect" });

    const placed = await call(
      router.tracks.createPlaced,
      pitch,
      by(staff, { ai: models({ pick: downDecisionModel() }) })
    );

    expect(placed.placement.degraded).toBe(true);
    expect(placed.placement.reasoning).toContain("La AI no respondió");
  });

  test("when no room has what the talk needs it goes to a free one and says what is missing", async () => {
    const { rooms, slots, staff, at, pitch } = await setup();
    await makeTrack(at(slots.early, rooms.tv), { title: "Una" });
    await makeTrack(at(slots.late, rooms.tv), { title: "Otra" });

    const placed = await call(
      router.tracks.createPlaced,
      { ...pitch, needsTV: true },
      by(staff, { ai: models({ pick: decidingModel() }) })
    );

    expect(placed.note).toMatchObject({ room: rooms.plain.name, needsTV: true });
    expect(placed.placement.missing).toStrictEqual(["tv"]);
  });

  test("a block label that repeats on another day resolves to the earliest day", async () => {
    const { event, rooms, slots, staff, at, pitch } = await setup();
    const nextDay = await makeSlot(event.id, {
      startTime: "15:00",
      endTime: "15:45",
      date: new Date("2026-11-08T12:00:00.000Z"),
    });
    await makeTrack(at(slots.late, rooms.plain), { title: "Tarde" });
    await makeTrack(at(slots.late, rooms.tv), { title: "Tarde TV" });

    const placed = await call(router.tracks.createPlaced, pitch, by(staff, { ai: models({ pick: decidingModel() }) }));

    expect(placed.note.timeSlot).toBe("15:00 - 15:45");
    expect(placed.note.scheduleId).toBe(slots.early.id);
    expect(placed.note.scheduleId).not.toBe(nextDay.id);
  });

  test("only site staff place talks this way", async () => {
    const { community, pitch } = await setup();
    const editor = await makeMember(community.id, "editor");

    await expect(call(router.tracks.createPlaced, pitch, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(call(router.tracks.createPlaced, pitch, by(editor))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
