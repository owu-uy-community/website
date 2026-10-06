import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { tracks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeSiteAdmin, makeSlot, makeTrack, makeUser } from "test/factories";

describe("schedules reads", () => {
  test("anyone lists an event's slots by date, then start time", async () => {
    const { event, slots } = await makeBoard();
    const earlier = await makeSlot(event.id, { startTime: "10:00", endTime: "10:45" });

    const list = await call(router.schedules.getByOpenSpace, { openSpaceId: event.id }, by(null));

    expect(list.map((slot) => slot.id)).toStrictEqual([earlier.id, slots.early.id, slots.late.id]);
  });

  test("a slot is fetched by id", async () => {
    const { slots } = await makeBoard();

    await expect(call(router.schedules.get, { id: slots.late.id }, by(null))).resolves.toMatchObject({
      id: slots.late.id,
      startTime: "16:00",
      endTime: "16:45",
    });
  });

  test("#12 an unknown slot is NOT_FOUND", async () => {
    await expect(call(router.schedules.get, { id: "no-existe" }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("schedules writes", () => {
  test("site staff creates a slot", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();

    const slot = await call(
      router.schedules.create,
      { name: "Cierre", startTime: "19:00", endTime: "19:45", date: "2026-11-07T12:00:00.000Z", openSpaceId: event.id },
      by(staff)
    );

    expect(slot).toMatchObject({ name: "Cierre", startTime: "19:00", openSpaceId: event.id, isActive: true });
  });

  test("#P3 create keeps highlightInKiosk", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();

    const slot = await call(
      router.schedules.create,
      {
        name: "Destacado",
        startTime: "19:00",
        endTime: "19:45",
        date: "2026-11-07T12:00:00.000Z",
        openSpaceId: event.id,
        highlightInKiosk: true,
      },
      by(staff)
    );

    expect(slot.highlightInKiosk).toBe(true);
  });

  test("only site staff may change slots", async () => {
    const { slots } = await makeBoard();
    const user = await makeUser();

    await expect(
      call(router.schedules.update, { id: slots.early.id, data: { startTime: "09:00" } }, by(user))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.schedules.delete, { id: slots.early.id }, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("#2 moving a slot's times keeps it highlighted on the kiosk", async () => {
    const { event } = await makeBoard();
    const highlighted = await makeSlot(event.id, { highlightInKiosk: true });
    const staff = await makeSiteAdmin();

    const updated = await call(
      router.schedules.update,
      { id: highlighted.id, data: { startTime: "17:00", endTime: "17:45" } },
      by(staff)
    );

    expect(updated).toMatchObject({ startTime: "17:00", highlightInKiosk: true });
  });

  test("deleting a slot deletes its talks", async () => {
    const { event, rooms, slots } = await makeBoard();
    const talk = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });
    const staff = await makeSiteAdmin();

    await call(router.schedules.delete, { id: slots.early.id }, by(staff));

    await expect(db.select().from(tracks).where(eq(tracks.id, talk.id))).resolves.toStrictEqual([]);
  });
});
