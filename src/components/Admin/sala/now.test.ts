import { describe, expect, test } from "vitest";

import { roomNow } from "./now";

const DAY = "2026-11-07T00:00:00.000Z";
const slot = (id: string, startTime: string, endTime: string, date = DAY) => ({
  id,
  name: id,
  startTime,
  endTime,
  date,
  isActive: true,
});
const slots = [
  slot("b2", "16:30", "16:55"),
  slot("b1", "16:00", "16:25"),
  slot("b3", "17:00", "17:25"),
  slot("late", "21:30", "22:30"),
];
const talks = [
  { id: "t1", scheduleId: "b1", roomId: "cueva" },
  { id: "t2", scheduleId: "b2", roomId: "cueva" },
  { id: "t3", scheduleId: "b3", roomId: "lobby" },
  { id: "t4", scheduleId: "late", roomId: "cueva" },
];
// Montevideo is UTC-3: 16:30 there is 19:30 UTC.
const at = (iso: string) => roomNow(slots, talks, "cueva", Date.parse(iso), "America/Montevideo");

describe("what a room has on now", () => {
  test("mid-block: its talk, the time the block has left, and the room's next talk (skipping blocks without one)", () => {
    const now = at("2026-11-07T19:40:30Z");

    expect(now.current?.slot.id).toBe("b2");
    expect(now.current?.talk?.id).toBe("t2");
    expect(now.current?.leftMs).toBe(14.5 * 60_000);
    expect(now.next?.talk.id).toBe("t4");
  });

  test("before the day and between blocks there is nothing on, only what comes next", () => {
    expect(at("2026-11-06T15:00:00Z")).toMatchObject({ current: null, next: { talk: { id: "t1" } } });
    expect(at("2026-11-07T19:27:00Z")).toMatchObject({ current: null, next: { talk: { id: "t2" } } });
  });

  test("the event's evening is still its day, though in UTC it is already tomorrow", () => {
    const now = at("2026-11-08T01:10:00Z");

    expect(now.today).toBe("2026-11-07");
    expect(now.current?.talk?.id).toBe("t4");
    expect(now.next).toBeNull();
  });
});
