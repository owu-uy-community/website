import { describe, expect, test } from "vitest";

import { stickyNoteStyle } from "./palette";

describe(stickyNoteStyle, () => {
  test("white and yellow rooms get black text; orange, red and blue keep white", () => {
    const ink = (color: string) => stickyNoteStyle(color).color;

    expect(["#ffffff", "#f5bb03", "#facc15", "#84cc16"].map(ink)).toStrictEqual(Array(4).fill("#0a0a0a"));
    expect(["#f97316", "#ef4444", "#3b82f6", "#a855f7", "#111111"].map(ink)).toStrictEqual(Array(5).fill("#ffffff"));
  });
});
