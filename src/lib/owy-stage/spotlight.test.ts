import { describe, expect, test } from "vitest";

import type { Spotlight } from "./scenes";
import {
  NO_SPOT,
  SPOT_FLY_MS,
  SPOT_IN_MS,
  SPOT_SETTLE_MS,
  SPOT_STALE_MS,
  cellBox,
  enqueue,
  flyTo,
  nextUp,
  phaseMs,
  readMs,
  rowWindow,
  spotting,
} from "./spotlight";

const spot = (id: string, track: string, how: Spotlight["how"] = "new"): Spotlight => ({
  id,
  how,
  track: {
    id: track,
    title: `Charla ${track}`,
    room: "Lobby",
    timeSlot: "16:00 - 16:25",
    roomId: "r",
    scheduleId: "s",
  },
});

describe("spotlight", () => {
  test("a sticky holds long enough to read, longer for longer titles, within bounds", () => {
    expect(readMs({ title: "IA" })).toBe(6_500);
    expect(readMs({ title: "Cómo escalamos un monolito sin romper nada", speaker: "Ana Pérez" })).toBe(
      3_500 + (42 + 9) * 65
    );
    expect(readMs({ title: "x".repeat(200) })).toBe(11_000);
  });

  test("a spotlight joins the line once, the operator's pick first, stale ones leave", () => {
    let queue = enqueue([], spot("a", "t1"), 0);
    queue = enqueue(queue, spot("a", "t1"), 10); // heard twice
    queue = enqueue(queue, spot("b", "t1"), 20); // the same talk, already waiting
    queue = enqueue(queue, spot("c", "t2"), 30);
    queue = enqueue(queue, spot("d", "t3", "manual"), 40);

    expect(queue.map((item) => item.id)).toStrictEqual(["d", "a", "c"]);
    expect(nextUp(queue, SPOT_STALE_MS + 5).spot?.id).toBe("d");
    expect(nextUp(queue, SPOT_STALE_MS + 35).rest.map((item) => item.id)).toStrictEqual([]);
  });

  test("the sticky flies to the middle of its cell, shrunk evenly to fit", () => {
    expect(flyTo({ x: 0, y: 0, w: 800, h: 400 }, { x: 1000, y: 500, w: 200, h: 200 })).toStrictEqual({
      x: 700,
      y: 400,
      scale: 0.25,
    });
  });
});

describe("the spotlight on the wall", () => {
  test("a spotlight plays in, holds, flies, lands, then the next one comes in", () => {
    let state = spotting(NO_SPOT, { type: "heard", spot: spot("a", "t1"), now: 0 });
    state = spotting(state, { type: "heard", spot: spot("b", "t2"), now: 0 });
    expect(state.current).toBeNull();

    state = spotting(state, { type: "next", now: 1 });
    expect([state.current?.id, state.phase]).toStrictEqual(["a", "in"]);
    // The talk on screen pressed again doesn't line up behind itself.
    expect(spotting(state, { type: "heard", spot: spot("c", "t1", "manual"), now: 2 }).queue).toHaveLength(1);

    const phases = [];
    for (let step = 0; step < 4; step++) {
      state = spotting(state, { type: "step", now: 3 });
      phases.push(`${state.current?.id}:${state.phase}`);
    }
    expect(phases).toStrictEqual(["a:hold", "a:fly", "a:land", "b:in"]);
    expect(spotting(spotting(state, { type: "drop" }), { type: "step", now: 4 }).current).toBeNull();
  });

  test("each phase lasts its time, the hold the reading time", () => {
    const { track } = spot("a", "t1");
    expect([phaseMs("in", track), phaseMs("hold", track), phaseMs("fly", track), phaseMs("land", track)]).toStrictEqual(
      [SPOT_IN_MS, readMs(track), SPOT_FLY_MS, SPOT_SETTLE_MS]
    );
  });
});

describe("the grid under the spotlight", () => {
  test("shows the day from the block that's on", () => {
    expect(rowWindow(4, 6, 2, null)).toBe(0); // fewer rows than room: all of them
    expect(rowWindow(10, 6, 2, null)).toBe(2);
    expect(rowWindow(10, 6, 8, null)).toBe(4); // near the end, still a full window
  });

  test("moves just enough to show the spotlight's block", () => {
    expect(rowWindow(10, 6, 2, 9)).toBe(4);
    expect(rowWindow(10, 6, 5, 1)).toBe(1);
    expect(rowWindow(10, 6, 2, 5)).toBe(2);
  });

  test("a cell's box is where the CSS grid puts it", () => {
    const grid = { x: 100, y: 50, w: 1000, h: 700 };
    // 2 columns of (1000 − 100 − 2·10) / 2 = 440, 3 rows of (700 − 40 − 3·10) / 3 = 210
    expect(cellBox(grid, { w: 100, h: 40 }, 10, { cols: 2, rows: 3 }, { col: 1, row: 2 })).toStrictEqual({
      x: 100 + 100 + 10 + 450,
      y: 50 + 40 + 10 + 2 * 220,
      w: 440,
      h: 210,
    });
  });
});
