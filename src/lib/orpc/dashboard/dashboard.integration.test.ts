import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeRoom, makeSiteAdmin, makeTrack, makeUser } from "test/factories";

describe("dashboard.getStats", () => {
  test("summarises the board: sessions, rooms, occupancy and the busiest rooms", async () => {
    const { event, rooms, slots } = await makeBoard();
    await makeRoom(event.id, { isActive: false });
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.tv.id });
    await makeTrack({ eventId: event.id, scheduleId: slots.late.id, roomId: rooms.tv.id });
    await makeTrack({ eventId: event.id, scheduleId: slots.late.id, roomId: rooms.plain.id });
    const staff = await makeSiteAdmin();

    const stats = await call(router.dashboard.getStats, { eventId: event.id }, by(staff));

    expect(stats).toMatchObject({
      event: { id: event.id, name: event.name },
      totalSessions: 3,
      activeRooms: 2,
      totalSchedules: 2,
      gridCells: 4,
      gridOccupancy: 0.75,
      eventbrite: null,
    });
    expect(stats.sessionsByRoom.map((row) => [row.roomId, row.sessions])).toStrictEqual([
      [rooms.tv.id, 2],
      [rooms.plain.id, 1],
    ]);
  });

  test("only site staff see the dashboard", async () => {
    const { event } = await makeBoard();
    const user = await makeUser();

    await expect(call(router.dashboard.getStats, { eventId: event.id }, by(user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("#18 the slot on now is found on the event's own clock", async () => {
    // The board's slots are 15:00–15:45 and 16:00–16:45 in Montevideo (UTC-3); the server runs in UTC.
    const { event, slots } = await makeBoard();
    const staff = await makeSiteAdmin();
    const statsAt = async (instant: string) => {
      vi.setSystemTime(new Date(instant));
      const stats = await call(router.dashboard.getStats, { eventId: event.id }, by(staff));

      return [stats.currentSchedule?.id ?? null, stats.nextSchedule?.id ?? null];
    };
    vi.useFakeTimers({ toFake: ["Date"] });

    await expect(statsAt("2026-11-07T17:59:00.000Z")).resolves.toStrictEqual([null, slots.early.id]);
    await expect(statsAt("2026-11-07T18:00:00.000Z")).resolves.toStrictEqual([slots.early.id, slots.late.id]);
    await expect(statsAt("2026-11-07T18:45:00.000Z")).resolves.toStrictEqual([null, slots.late.id]);
    await expect(statsAt("2026-11-08T18:20:00.000Z")).resolves.toStrictEqual([null, null]);
  });

  test("#13 the event must be named — there is no implicit default event", async () => {
    const staff = await makeSiteAdmin();

    // @ts-expect-error the event is required
    await expect(call(router.dashboard.getStats, {}, by(staff))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(call(router.dashboard.getStats, { eventId: "no-existe" }, by(staff))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
