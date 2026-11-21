import { call } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { incidents, staffArrivals, staffTaskAssignments, staffTasks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { wallClock } from "lib/slot-day";
import { by } from "test/context";
import { makeBoard, makeEvent, makeMember, makeSiteAdmin } from "test/factories";

const hhmm = (at: Date) => wallClock(at, "America/Montevideo").slice(11);
const today = () => wallClock(new Date(), "America/Montevideo").slice(0, 10);

/** An event that is on right now, on the Montevideo clock. */
const liveEvent = async (communityId: string) =>
  makeEvent(communityId, {
    startDate: new Date(Date.now() - 2 * 3_600_000),
    endDate: new Date(Date.now() + 4 * 3_600_000),
    timezone: "America/Montevideo",
  });

describe("dashboard.today", () => {
  // Mid-afternoon in Montevideo, so "started 20 minutes ago" never crosses midnight.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T19:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  test("organizers read it; plain members don't", async () => {
    const { community, event } = await makeBoard();
    const organizer = await makeMember(community.id, "admin");
    const member = await makeMember(community.id, "member");

    await expect(call(router.dashboard.today, { eventId: event.id }, by(organizer))).resolves.toMatchObject({
      event: { id: event.id },
    });
    await expect(call(router.dashboard.today, { eventId: event.id }, by(member))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("the phase follows the event's clock", async () => {
    const { community } = await makeBoard();
    const staff = await makeSiteAdmin();
    const soon = await makeEvent(community.id, {
      startDate: new Date(Date.now() + 10 * 86_400_000),
      endDate: new Date(Date.now() + 10 * 86_400_000 + 3_600_000),
    });
    const past = await makeEvent(community.id, {
      startDate: new Date(Date.now() - 3 * 86_400_000),
      endDate: new Date(Date.now() - 3 * 86_400_000 + 3_600_000),
    });
    const now = await liveEvent(community.id);

    expect((await call(router.dashboard.today, { eventId: soon.id }, by(staff))).phase).toBe("pre");
    const report = await call(router.dashboard.today, { eventId: past.id }, by(staff));
    expect(report.phase).toBe("post");
    expect(report.report).not.toBeNull();
    expect((await call(router.dashboard.today, { eventId: now.id }, by(staff))).phase).toBe("live");
  });

  test("someone on a task that started a while ago and who hasn't arrived is late; arriving clears it", async () => {
    const { community } = await makeBoard();
    const staff = await makeSiteAdmin();
    const event = await liveEvent(community.id);
    const helper = await makeMember(community.id, "member", { name: "Helper Tardío" });
    const [task] = await db
      .insert(staffTasks)
      .values({
        openSpaceId: event.id,
        title: "Acreditación",
        dayDate: new Date(`${today()}T00:00:00.000Z`),
        startTime: hhmm(new Date(Date.now() - 20 * 60_000)),
        endTime: hhmm(new Date(Date.now() + 40 * 60_000)),
        minPeople: 2,
      })
      .returning();
    await db.insert(staffTaskAssignments).values({ taskId: task.id, userId: helper.id });

    const before = await call(router.dashboard.today, { eventId: event.id }, by(staff));
    expect(before.staff.late).toStrictEqual([expect.objectContaining({ id: helper.id, task: "Acreditación" })]);
    expect(before.coverage).toStrictEqual([{ group: "Acreditación", have: 1, need: 2 }]);

    await db.insert(staffArrivals).values({ eventId: event.id, userId: helper.id });
    const after = await call(router.dashboard.today, { eventId: event.id }, by(staff));
    expect(after.staff.late).toStrictEqual([]);
    expect(after.staff.onSite).toBe(1);
  });

  test("a confidential report never shows its title on mission control", async () => {
    const { community } = await makeBoard();
    const staff = await makeSiteAdmin();
    const event = await liveEvent(community.id);
    await db
      .insert(incidents)
      .values({ eventId: event.id, title: "Nombre de la persona", sensitive: true, severity: "high" });

    const today = await call(router.dashboard.today, { eventId: event.id }, by(staff));

    expect(today.incidents.items).toStrictEqual([
      expect.objectContaining({ title: "Reporte confidencial", category: "conduct" }),
    ]);
    expect(today.incidents.critical).toBe(1);
  });
});
