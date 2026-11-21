import { describe, expect, test } from "vitest";

import { tabSwipeDirection } from "./swipe";

const trace = (dx: number, dy = 0, ms = 250, x0 = 200) => ({ x0, y0: 300, x1: x0 + dx, y1: 300 + dy, ms });

describe(tabSwipeDirection, () => {
  test("a quick sideways swipe moves one tab: left goes to the next, right to the previous", () => {
    expect(tabSwipeDirection(trace(-120), 393)).toBe(1);
    expect(tabSwipeDirection(trace(120), 393)).toBe(-1);
  });

  test("a short, slow or mostly vertical touch is not a swipe", () => {
    expect(tabSwipeDirection(trace(-40), 393)).toBe(0);
    expect(tabSwipeDirection(trace(-120, 0, 900), 393)).toBe(0);
    expect(tabSwipeDirection(trace(-120, 90), 393)).toBe(0);
  });

  test("a touch that starts at the screen's edge belongs to the browser's back gesture", () => {
    expect(tabSwipeDirection(trace(150, 0, 250, 10), 393)).toBe(0);
    expect(tabSwipeDirection(trace(-150, 0, 250, 385), 393)).toBe(0);
  });
});
