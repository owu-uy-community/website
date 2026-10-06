import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeRoom, makeSiteAdmin, makeSlot, makeTrack, makeUser } from "test/factories";

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

  test.fails("#18 the current slot is found in the event's own timezone", async () => {
    const { event } = await makeBoard();
    // 15:00–15:45 in Montevideo is 18:00–18:45 UTC; the server runs in UTC.
    const now = await makeSlot(event.id, { startTime: "15:00", endTime: "15:45", name: "Ahora" });
    const staff = await makeSiteAdmin();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T18:20:00.000Z"));

    const stats = await call(router.dashboard.getStats, { eventId: event.id }, by(staff));

    expect(stats.currentSchedule?.name).toBe(now.name);
  });

  test.fails("#13 the event must be named — there is no implicit default event", async () => {
    const staff = await makeSiteAdmin();

    await expect(call(router.dashboard.getStats, {}, by(staff))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
