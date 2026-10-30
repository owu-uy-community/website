import { describe, expect, test } from "vitest";

import { resolveNowNext, wallClockSeconds } from "./now-next";

const TZ = "America/Montevideo";
const DAY = "2026-11-07T00:00:00.000Z";

const slot = (id: string, startTime: string, endTime: string) => ({
  id,
  name: id,
  startTime,
  endTime,
  date: DAY,
  isActive: true,
});

// 25-minute blocks with 5-minute changeovers, as the conf runs them
const BLOCKS = [slot("b1", "16:00", "16:25"), slot("b2", "16:30", "16:55"), slot("b3", "17:00", "17:25")];

/** An instant that reads as the given Montevideo (UTC−3) wall clock. */
const at = (time: string) => new Date(`2026-11-07T${time}-03:00`);

describe(resolveNowNext, () => {
  test("reads the wall clock in the event's time zone, to the second", () => {
    expect(wallClockSeconds(at("16:05:09"), TZ)).toBe("2026-11-07T16:05:09");
  });

  test("before the first block, it counts down to it", () => {
    const before = resolveNowNext(BLOCKS, TZ, at("15:15:00"));

    expect(before).toMatchObject({ phase: "before", current: null, next: { id: "b1" }, secondsUntilChange: 45 * 60 });
  });

  test("a running block counts down to its end, seconds included", () => {
    expect(resolveNowNext(BLOCKS, TZ, at("16:05:00"))).toMatchObject({
      phase: "running",
      current: { id: "b1" },
      next: { id: "b2" },
      secondsUntilChange: 20 * 60,
    });
    expect(resolveNowNext(BLOCKS, TZ, at("16:05:37")).secondsUntilChange).toBe(19 * 60 + 23);
  });

  test("the changeover is a break: nothing on, the next block counting down", () => {
    expect(resolveNowNext(BLOCKS, TZ, at("16:27:00"))).toMatchObject({
      phase: "break",
      current: null,
      next: { id: "b2" },
      secondsUntilChange: 3 * 60,
    });
  });

  test("a block's start is inclusive and its end exclusive: no instant belongs to two", () => {
    expect(resolveNowNext(BLOCKS, TZ, at("16:25:00")).phase).toBe("break");
    expect(resolveNowNext(BLOCKS, TZ, at("16:30:00")).current?.id).toBe("b2");
  });

  test("after the last block there is nothing left to count", () => {
    expect(resolveNowNext(BLOCKS, TZ, at("19:00:00"))).toStrictEqual({
      phase: "after",
      current: null,
      next: null,
      secondsUntilChange: null,
    });
  });

  test("a visitor in another time zone sees the block of the room", () => {
    expect(resolveNowNext(BLOCKS, TZ, new Date("2026-11-08T04:05:00+09:00")).current?.id).toBe("b1");
  });

  test("inactive blocks never count, and an empty board is «before», not a crash", () => {
    const withInactive = [{ ...slot("b0", "16:00", "16:30"), isActive: false }, ...BLOCKS];

    expect(resolveNowNext(withInactive, TZ, at("16:05:00")).current?.id).toBe("b1");
    expect(resolveNowNext([], TZ, at("16:05:00")).phase).toBe("before");
  });
});
