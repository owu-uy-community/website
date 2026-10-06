import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { events, rooms, schedules, tracks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeCommunity, makeEvent, makeMember, makeSiteAdmin, makeTrack, makeUser } from "test/factories";

const EVENT_DATES = { startDate: "2026-11-07T17:30:00.000Z", endDate: "2026-11-07T23:30:00.000Z" };

describe("openSpaces.listByCommunity", () => {
  test("lists a community's events, newest first", async () => {
    const community = await makeCommunity();
    const older = await makeEvent(community.id, { startDate: new Date("2025-11-01T12:00:00Z") });
    const newer = await makeEvent(community.id, { startDate: new Date("2026-11-07T12:00:00Z") });
    const staff = await makeSiteAdmin();

    const list = await call(router.openSpaces.listByCommunity, { communityId: community.id }, by(staff));

    expect(list.map((event) => event.id)).toStrictEqual([newer.id, older.id]);
  });

  test.fails("#21 anonymous callers cannot list a community's events", async () => {
    const community = await makeCommunity();

    await expect(
      call(router.openSpaces.listByCommunity, { communityId: community.id }, by(null))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("openSpaces.listForAdmin", () => {
  test("site staff sees every event; members only their communities' events", async () => {
    const mine = await makeCommunity();
    const theirs = await makeCommunity();
    const [myEvent, theirEvent] = await Promise.all([makeEvent(mine.id), makeEvent(theirs.id)]);
    const member = await makeMember(mine.id, "member");
    const staff = await makeSiteAdmin();

    const forMember = (await call(router.openSpaces.listForAdmin, undefined, by(member))).map((e) => e.id);
    const forStaff = (await call(router.openSpaces.listForAdmin, undefined, by(staff))).map((e) => e.id);

    expect(forMember).toStrictEqual([myEvent.id]);
    expect(forStaff).toStrictEqual(expect.arrayContaining([myEvent.id, theirEvent.id]));
    await expect(call(router.openSpaces.listForAdmin, undefined, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("openSpaces.get", () => {
  test("returns the event with ISO dates", async () => {
    const community = await makeCommunity();
    const event = await makeEvent(community.id, { name: "Ágiles 2026" });

    await expect(call(router.openSpaces.get, { id: event.id }, by(null))).resolves.toMatchObject({
      id: event.id,
      name: "Ágiles 2026",
      startDate: "2026-11-07T17:30:00.000Z",
      communityId: community.id,
    });
  });

  test.fails("#12 an unknown id is NOT_FOUND", async () => {
    await expect(call(router.openSpaces.get, { id: "no-existe" }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("openSpaces.create", () => {
  test("site staff creates an event; the slug comes from the name and stays unique", async () => {
    const community = await makeCommunity();
    const staff = await makeSiteAdmin();
    const input = { communityId: community.id, name: "OWU Conf 2026", ...EVENT_DATES };

    const first = await call(router.openSpaces.create, input, by(staff));
    const second = await call(router.openSpaces.create, input, by(staff));

    expect([first.slug, second.slug]).toStrictEqual(["owu-conf-2026", "owu-conf-2026-2"]);
    expect(first).toMatchObject({ communityId: community.id, isActive: true, timezone: "America/Montevideo" });
  });

  test("only site staff may create events", async () => {
    const community = await makeCommunity();
    const owner = await makeMember(community.id, "owner");

    await expect(
      call(router.openSpaces.create, { communityId: community.id, name: "X", ...EVENT_DATES }, by(owner))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test.fails("#12 an end before the start is a BAD_REQUEST and an unknown community a NOT_FOUND", async () => {
    const community = await makeCommunity();
    const staff = await makeSiteAdmin();
    const reversed = { startDate: EVENT_DATES.endDate, endDate: EVENT_DATES.startDate };

    await expect(
      call(router.openSpaces.create, { communityId: community.id, name: "X", ...reversed }, by(staff))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(router.openSpaces.create, { communityId: "no-existe", name: "X", ...EVENT_DATES }, by(staff))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("openSpaces.update", () => {
  test("site staff renames an event", async () => {
    const community = await makeCommunity();
    const event = await makeEvent(community.id);
    const staff = await makeSiteAdmin();

    const updated = await call(router.openSpaces.update, { id: event.id, data: { name: "Renombrado" } }, by(staff));

    expect(updated).toMatchObject({ id: event.id, name: "Renombrado" });
  });

  test.fails("#2 a partial update leaves the fields it did not send alone", async () => {
    const community = await makeCommunity();
    const event = await makeEvent(community.id, { isActive: false, autoHighlightEnabled: true });
    const staff = await makeSiteAdmin();

    const updated = await call(router.openSpaces.update, { id: event.id, data: { name: "Solo el nombre" } }, by(staff));

    expect(updated).toMatchObject({ isActive: false, autoHighlightEnabled: true });
  });

  test.fails("#3 timezone, Eventbrite id, venue map and slug are saved", async () => {
    const community = await makeCommunity();
    const event = await makeEvent(community.id);
    const staff = await makeSiteAdmin();
    const data = {
      timezone: "America/Argentina/Buenos_Aires",
      eventbriteEventId: "123456789",
      venueMapUrl: "https://owu.uy/mapa.png",
      slug: "nuevo-slug",
    };

    await call(router.openSpaces.update, { id: event.id, data }, by(staff));
    const [row] = await db.select().from(events).where(eq(events.id, event.id));

    expect(row).toMatchObject(data);
  });
});

describe("openSpaces.delete", () => {
  test("site staff deletes an event with its slots, rooms and talks", async () => {
    const { event, rooms: boardRooms, slots } = await makeBoard();
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: boardRooms.plain.id });
    const staff = await makeSiteAdmin();

    await call(router.openSpaces.delete, { id: event.id }, by(staff));

    const leftovers = await Promise.all([
      db.select().from(events).where(eq(events.id, event.id)),
      db.select().from(schedules).where(eq(schedules.openSpaceId, event.id)),
      db.select().from(rooms).where(eq(rooms.openSpaceId, event.id)),
      db.select().from(tracks).where(eq(tracks.openSpaceId, event.id)),
    ]);
    expect(leftovers.map((rows) => rows.length)).toStrictEqual([0, 0, 0, 0]);
  });

  test("non-staff cannot delete events", async () => {
    const { event } = await makeBoard();
    const user = await makeUser();

    await expect(call(router.openSpaces.delete, { id: event.id }, by(user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
