import { describe, expect, test } from "vitest";

import { WALL_AREA, wallLayout, type Tile } from "./welcome-wall";

const tiles = (count: number) =>
  Array.from({ length: count }, (_, i) => wallLayout(count).tile(i)).filter((tile): tile is Tile => tile !== null);

describe("welcome wall grid", () => {
  test.each([1, 7, 40, 290, 520])("%i arrivals fit inside the area without overlapping", (count) => {
    const placed = tiles(count);

    expect(placed).toHaveLength(count);
    for (const { left, top, size } of placed) {
      expect(left).toBeGreaterThanOrEqual(WALL_AREA.left);
      expect(top).toBeGreaterThanOrEqual(WALL_AREA.top);
      expect(left + size).toBeLessThanOrEqual(WALL_AREA.left + WALL_AREA.width + 1);
      expect(top + size).toBeLessThanOrEqual(WALL_AREA.top + WALL_AREA.height + 1);
    }
    for (const [i, a] of placed.entries()) {
      for (const b of placed.slice(i + 1)) {
        expect(Math.abs(a.left - b.left) >= a.size || Math.abs(a.top - b.top) >= a.size).toBe(true);
      }
    }
  });

  test("tiles shrink as the crowd grows", () => {
    expect(wallLayout(1).tile(0)?.size).toBe(220);
    expect(wallLayout(290).tile(0)?.size).toBeLessThan(wallLayout(40).tile(0)?.size ?? 0);
  });

  test("past what fits, the newest stay on the wall", () => {
    const { shown, tile } = wallLayout(2000);

    expect(shown).toBeLessThan(2000);
    expect(tile(0)).toBeNull();
    expect(tile(1999)).not.toBeNull();
    expect(tile(2000)).toBeNull();
  });
});
