import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { tracks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by } from "test/context";
import { makeBoard, makeEvent, makeSiteAdmin, makeSlot, makeTrack, makeUser } from "test/factories";

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

  test("a slot created without a day lands on the day its event starts, on the event's clock", async () => {
    const { community } = await makeBoard();
    // 22:30 on the 7th in Montevideo is already the 8th in UTC.
    const lateEvent = await makeEvent(community.id, {
      startDate: new Date("2026-11-08T01:30:00.000Z"),
      endDate: new Date("2026-11-08T03:00:00.000Z"),
    });
    const staff = await makeSiteAdmin();

    const slot = await call(
      router.schedules.create,
      { name: "Trasnoche", startTime: "22:30", endTime: "23:15", openSpaceId: lateEvent.id },
      by(staff)
    );

    expect(slot.date).toBe("2026-11-07T00:00:00.000Z");
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

  test("every slot change tells the boards to re-read the grid", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();
    const publish = vi.spyOn(hub, "publish");
    const pinged = () =>
      publish.mock.calls.filter(
        ([channel, name]) => channel === `event:${event.id}:sync` && name === "structure_change"
      ).length;

    const slot = await call(
      router.schedules.create,
      { name: "Bloque", startTime: "18:00", endTime: "18:45", openSpaceId: event.id },
      by(staff)
    );
    expect(pinged()).toBe(1);
    await call(router.schedules.update, { id: slot.id, data: { endTime: "19:00" } }, by(staff));
    expect(pinged()).toBe(2);
    await call(router.schedules.delete, { id: slot.id }, by(staff));
    expect(pinged()).toBe(3);
  });

  test("deleting a slot deletes its talks", async () => {
    const { event, rooms, slots } = await makeBoard();
    const talk = await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });
    const staff = await makeSiteAdmin();

    await call(router.schedules.delete, { id: slots.early.id }, by(staff));

    await expect(db.select().from(tracks).where(eq(tracks.id, talk.id))).resolves.toStrictEqual([]);
  });
});
