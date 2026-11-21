import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { ROOM_PALETTE, roomColorFor } from "lib/rooms/palette";
import { by } from "test/context";
import { makeBoard, makeMember, makeRoom, makeSiteAdmin, makeTrack, makeUser } from "test/factories";

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

  test("a new room takes a colour no other room of the event shows", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();
    const colours = async () =>
      (await call(router.rooms.getByOpenSpace, { openSpaceId: event.id }, by(null))).map((room) =>
        roomColorFor(room.id, room.color)
      );
    // Counting rooms would pick the palette's fourth colour for the fourth room: make it taken.
    await makeRoom(event.id, { name: "Pintada", color: ROOM_PALETTE[3] });
    const inUse = await colours();

    const room = await call(
      router.rooms.create,
      { name: "Patio", openSpaceId: event.id, hasTV: false, hasWhiteboard: false, isActive: true },
      by(staff)
    );

    expect(inUse).not.toContain(room.color);
  });

  test("clearing a room's capacity and description in the editor clears them", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();
    const room = await makeRoom(event.id, { capacity: 40, description: "Al fondo" });

    const updated = await call(
      router.rooms.update,
      { id: room.id, data: { capacity: null, description: "" } },
      by(staff)
    );

    expect(updated.capacity).toBeUndefined();
    expect(updated.description).toBeUndefined();
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

  test("every room change tells the boards to re-read the grid", async () => {
    const { event, rooms } = await makeBoard();
    const staff = await makeSiteAdmin();
    const publish = vi.spyOn(hub, "publish");
    const pinged = () =>
      publish.mock.calls.filter(
        ([channel, name]) => channel === `event:${event.id}:sync` && name === "structure_change"
      ).length;

    const patio = await call(
      router.rooms.create,
      { name: "Patio", openSpaceId: event.id, hasTV: false, hasWhiteboard: false, isActive: true },
      by(staff)
    );
    expect(pinged()).toBe(1);
    await call(router.rooms.update, { id: patio.id, data: { isActive: false } }, by(staff));
    expect(pinged()).toBe(2);
    await call(router.rooms.reorder, { openSpaceId: event.id, orderedIds: [patio.id, rooms.plain.id] }, by(staff));
    expect(pinged()).toBe(3);
    await call(router.rooms.delete, { id: patio.id }, by(staff));
    expect(pinged()).toBe(4);
  });

  test("deleting a room removes it from the board", async () => {
    const { event, rooms } = await makeBoard();
    const staff = await makeSiteAdmin();

    await call(router.rooms.delete, { id: rooms.plain.id }, by(staff));

    const list = await call(router.rooms.getByOpenSpace, { openSpaceId: event.id }, by(null));
    expect(list.map((room) => room.id)).toStrictEqual([rooms.tv.id]);
  });
});

describe("room status", () => {
  test("a room's host marks it full; the board hears it and the log says who", async () => {
    const { community, event, rooms } = await makeBoard();
    const host = await makeMember(community.id, "member", { name: "Host Lobby" });
    const publish = vi.spyOn(hub, "publish");

    const room = await call(router.rooms.setStatus, { roomId: rooms.plain.id, status: "full" }, by(host));

    expect(room).toMatchObject({ status: "full" });
    expect(room.statusUpdatedAt).not.toBeNull();
    expect(
      publish.mock.calls.some(([channel, name]) => channel === `event:${event.id}:sync` && name === "structure_change")
    ).toBe(true);
    const [line] = await call(
      router.activity.list,
      { eventId: event.id, entityId: room.id },
      by(await makeSiteAdmin())
    );
    expect(line).toMatchObject({ verb: "room.status", actor: { id: host.id } });
  });

  test("someone outside the community can't touch a room's status", async () => {
    const { rooms } = await makeBoard();

    await expect(
      call(router.rooms.setStatus, { roomId: rooms.plain.id, status: "evacuate" }, by(await makeUser()))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("a member of another community can't touch this one's rooms; the room decides the community", async () => {
    const ours = await makeBoard();
    const theirs = await makeBoard();
    const neighbour = await makeMember(theirs.community.id, "owner");

    await expect(
      call(router.rooms.setStatus, { roomId: ours.rooms.plain.id, status: "full" }, by(neighbour))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.rooms.setStatus, { roomId: "does-not-exist", status: "full" }, by(neighbour))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("evacuating alerts the whole staff once, and the all-clear goes out calmly", async () => {
    const { community, event, rooms } = await makeBoard();
    const host = await makeMember(community.id, "member", { name: "Host Cueva" });
    const setStatus = (status: "open" | "full" | "evacuate") =>
      call(router.rooms.setStatus, { roomId: rooms.plain.id, status }, by(host));
    const announcements = async () =>
      (await call(router.staffTasks.announcements.list, { eventId: event.id }, by(host)))
        .map((item) => [item.body, item.urgent])
        .toReversed();

    await setStatus("full");
    await expect(announcements()).resolves.toStrictEqual([]);

    await setStatus("evacuate");
    await setStatus("evacuate");
    await setStatus("open");

    await expect(announcements()).resolves.toStrictEqual([
      [`Evacuar ${rooms.plain.name}`, true],
      [`${rooms.plain.name} vuelve a estar abierta`, false],
    ]);
  });
});

describe("rooms activity", () => {
  test("adding, renaming and deleting a room each leave a line", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();

    const room = await call(
      router.rooms.create,
      { name: "Patio", openSpaceId: event.id, hasTV: false, hasWhiteboard: false, isActive: true },
      by(staff)
    );
    await call(router.rooms.update, { id: room.id, data: { name: "Terraza" } }, by(staff));
    await call(router.rooms.delete, { id: room.id }, by(staff));

    const lines = await call(router.activity.list, { eventId: event.id, entityId: room.id }, by(staff));
    expect(lines.map((line) => line.summary)).toStrictEqual([
      "borró la sala Terraza",
      "renombró la sala Patio a Terraza",
      "agregó la sala Patio",
    ]);
  });
});
