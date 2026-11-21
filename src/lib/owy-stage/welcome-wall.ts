/**
 * The welcome wall's grid, in the 1920×1080 frame: round tiles under the header, as big as the
 * crowd allows, rows centred, the oldest arrival first. Pure, so the wall and its test share it.
 */
export const WALL_AREA = { left: 120, top: 280, width: 1680, height: 740 } as const;
/** Space between tiles, as a share of the tile. */
const GAP = 0.12;
const MAX = 220;
const MIN = 40;

export type Tile = { left: number; top: number; size: number };

const fit = (size: number) => {
  const step = size * (1 + GAP);

  return {
    size,
    step,
    cols: Math.floor((WALL_AREA.width + size * GAP) / step),
    rows: Math.floor((WALL_AREA.height + size * GAP) / step),
  };
};

/**
 * Where each of `count` tiles goes. Past what fits at the smallest size (592), the newest stay.
 * ponytail: a square grid; a hex packing would fit ~15% more if a crowd ever outgrows it.
 */
export function wallLayout(count: number) {
  let grid = fit(MAX);
  for (let size = MAX; size >= MIN && grid.cols * grid.rows < count; size -= 2) grid = fit(size);
  const shown = Math.min(count, grid.cols * grid.rows);
  const rows = Math.ceil(shown / grid.cols);
  const top = WALL_AREA.top + (WALL_AREA.height - (rows * grid.step - grid.size * GAP)) / 2;

  /** Tile `index` (0 = the first to arrive), or null when it no longer fits. */
  const tile = (index: number): Tile | null => {
    const i = index - (count - shown);
    if (i < 0 || index >= count) return null;
    const row = Math.floor(i / grid.cols);
    const inRow = Math.min(grid.cols, shown - row * grid.cols);
    const left = WALL_AREA.left + (WALL_AREA.width - (inRow * grid.step - grid.size * GAP)) / 2;

    return {
      left: Math.round(left + (i % grid.cols) * grid.step),
      top: Math.round(top + row * grid.step),
      size: grid.size,
    };
  };

  return { shown, tile };
}
