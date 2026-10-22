import { describe, expect, test } from "vitest";

import { filterNotes } from "components/Meetups/OpenSpace/utils/calculations";
import type { StickyNote } from "lib/orpc";

import { slotPhase } from "./agenda-state";
import { nextCell } from "./board-a11y";

describe(filterNotes, () => {
  const talk = (title: string, speaker?: string) => ({ id: title, title, speaker }) as StickyNote;
  const notes = [talk("Metodología forense digital", "Jimena Mújica"), talk("Kubernetes para devs")];

  test("a search typed without accents or capitals finds the talk by title or speaker", () => {
    expect(filterNotes(notes, "metodologia").map((note) => note.id)).toStrictEqual(["Metodología forense digital"]);
    expect(filterNotes(notes, " MUJICA ").map((note) => note.id)).toStrictEqual(["Metodología forense digital"]);
    expect(filterNotes(notes, "   ")).toBe(notes);
  });
});

/** A 3 x 2 board of 100 x 50 cells: columns at x 0, 100, 200; rows at y 0, 50. */
const cells = [0, 1].flatMap((row) =>
  [0, 1, 2].map((column) => ({ left: column * 100, top: row * 50, width: 100, height: 50 }))
);
const cellAt = (column: number, row: number) => cells[row * 3 + column];
/** The card in hand: inset in its cell like the real ones. */
const cardIn = (column: number, row: number) => ({ left: column * 100 + 6, top: row * 50 + 6, width: 88, height: 38 });

describe(nextCell, () => {
  test("an arrow moves one cell in its direction, keeping to the row or column", () => {
    expect(nextCell(cardIn(0, 0), cells, [1, 0])).toBe(cellAt(1, 0));
    expect(nextCell(cardIn(1, 0), cells, [0, 1])).toBe(cellAt(1, 1));
    expect(nextCell(cardIn(2, 1), cells, [-1, 0])).toBe(cellAt(1, 1));
    expect(nextCell(cardIn(1, 1), cells, [0, -1])).toBe(cellAt(1, 0));
  });

  test("at the edge of the board there is nowhere to go", () => {
    expect(nextCell(cardIn(2, 0), cells, [1, 0])).toBeNull();
    expect(nextCell(cardIn(0, 0), cells, [0, -1])).toBeNull();
  });
});

describe(slotPhase, () => {
  const slot = { date: "2026-11-07T00:00:00.000Z", startTime: "16:30", endTime: "16:55" };

  test("a block is still to come, on now, or over on the event's clock", () => {
    expect(slotPhase(slot, "2026-11-07T16:29")).toBe("next");
    expect(slotPhase(slot, "2026-11-07T16:30")).toBe("now");
    expect(slotPhase(slot, "2026-11-07T16:54")).toBe("now");
    expect(slotPhase(slot, "2026-11-07T16:55")).toBe("past");
  });

  test("the day counts, not only the time", () => {
    expect(slotPhase(slot, "2026-11-06T16:40")).toBe("next");
    expect(slotPhase(slot, "2026-11-08T16:40")).toBe("past");
  });
});
