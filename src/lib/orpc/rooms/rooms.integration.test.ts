import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by } from "test/context";
import { makeBoard, makeRoom, makeSiteAdmin, makeTrack, makeUser } from "test/factories";

describe("rooms reads", () => {
  test("anyone lists an event's rooms in board order", async () => {
    const { event, rooms } = await makeBoard();
    const first = await makeRoom(event.id, { name: "Zeta", sortOrder: -1 });

    const list = await call(router.rooms.getByOpenSpace, { openSpaceId: event.id }, by(null));

    expect(list.map((room) => room.id)).toStrictEqual([first.id, rooms.plain.id, rooms.tv.id]);
  });

  test("a room is fetched by id", async () => {
    const { rooms } = await makeBoard();

    await expect(call(router.rooms.get, { id: rooms.tv.id }, by(null))).resolves.toMatchObject({
      id: rooms.tv.id,
      hasTV: true,
      hasWhiteboard: true,
    });
  });
});

describe("rooms writes", () => {
  test("a new room goes to the end of the board with a palette color", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();

    const room = await call(
      router.rooms.create,
      { name: "Patio", openSpaceId: event.id, hasTV: false, hasWhiteboard: false, isActive: true },
      by(staff)
    );

    expect(room).toMatchObject({ name: "Patio", sortOrder: 2 });
    expect(room.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("only site staff may manage rooms", async () => {
    const { event, rooms } = await makeBoard();
    const user = await makeUser();

    await expect(
      call(
        router.rooms.create,
        { name: "Patio", openSpaceId: event.id, hasTV: false, hasWhiteboard: false, isActive: true },
        by(user)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.rooms.delete, { id: rooms.plain.id }, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("#12 a duplicate room name in the same event is a CONFLICT", async () => {
    const { event, rooms } = await makeBoard();
    const staff = await makeSiteAdmin();

    await expect(
      call(
        router.rooms.create,
        { name: rooms.plain.name, openSpaceId: event.id, hasTV: false, hasWhiteboard: false, isActive: true },
        by(staff)
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("#2 renaming a room keeps its TV and whiteboard", async () => {
    const { rooms } = await makeBoard();
    const staff = await makeSiteAdmin();

    const updated = await call(router.rooms.update, { id: rooms.tv.id, data: { name: "Auditorio" } }, by(staff));

    expect(updated).toMatchObject({ name: "Auditorio", hasTV: true, hasWhiteboard: true });
  });

  test("reorder rewrites the board order of the listed rooms only within the event", async () => {
    const { event, rooms } = await makeBoard();
    const other = await makeBoard();
    const staff = await makeSiteAdmin();

    await call(
      router.rooms.reorder,
      { openSpaceId: event.id, orderedIds: [rooms.tv.id, rooms.plain.id, other.rooms.plain.id] },
      by(staff)
    );

    const mine = await call(router.rooms.getByOpenSpace, { openSpaceId: event.id }, by(null));
    const theirs = await call(router.rooms.getByOpenSpace, { openSpaceId: other.event.id }, by(null));
    expect(mine.map((room) => room.id)).toStrictEqual([rooms.tv.id, rooms.plain.id]);
    expect(theirs.map((room) => [room.id, room.sortOrder])).toStrictEqual([
      [other.rooms.plain.id, 0],
      [other.rooms.tv.id, 1],
    ]);
  });

  test("rooms left out of a reorder keep their relative order after the listed ones", async () => {
    const { event, rooms } = await makeBoard();
    const third = await makeRoom(event.id, { name: "Tercera", sortOrder: 2 });
    const staff = await makeSiteAdmin();

    await call(router.rooms.reorder, { openSpaceId: event.id, orderedIds: [third.id] }, by(staff));

    const list = await call(router.rooms.getByOpenSpace, { openSpaceId: event.id }, by(null));
    expect(list.map((room) => [room.id, room.sortOrder])).toStrictEqual([
      [third.id, 0],
      [rooms.plain.id, 1],
      [rooms.tv.id, 2],
    ]);
  });

  test("two staffers adding the same room name at once get one room and one CONFLICT", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();
    const add = () =>
      call(
        router.rooms.create,
        { name: "Auditorio", openSpaceId: event.id, hasTV: false, hasWhiteboard: false, isActive: true },
        by(staff)
      );

    const results = await Promise.allSettled([add(), add()]);

    expect(
      results.map((r) => (r.status === "fulfilled" ? "created" : (r.reason as { code: string }).code)).toSorted()
    ).toStrictEqual(["CONFLICT", "created"]);
  });

  test("deleting a room tells the boards which talks went with it", async () => {
    const { event, rooms, slots } = await makeBoard();
    const talk = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });
    const staff = await makeSiteAdmin();
    const publish = vi.spyOn(hub, "publish");

    await call(router.rooms.delete, { id: rooms.plain.id }, by(staff));

    expect(publish).toHaveBeenCalledWith(
      `event:${event.id}:sync`,
      "card_change",
      expect.objectContaining({ type: "CARD_DELETE", payload: expect.objectContaining({ cardId: talk.id }) })
    );
  });

  test("deleting a room removes it from the board", async () => {
    const { event, rooms } = await makeBoard();
    const staff = await makeSiteAdmin();

    await call(router.rooms.delete, { id: rooms.plain.id }, by(staff));

    const list = await call(router.rooms.getByOpenSpace, { openSpaceId: event.id }, by(null));
    expect(list.map((room) => room.id)).toStrictEqual([rooms.tv.id]);
  });
});
