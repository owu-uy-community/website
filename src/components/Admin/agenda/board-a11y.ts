import {
  KeyboardCode,
  pointerWithin,
  rectIntersection,
  type Active,
  type Announcements,
  type CollisionDetection,
  type KeyboardCodes,
  type KeyboardCoordinateGetter,
  type Over,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";

import type { StickyNote } from "lib/orpc";

type Box = { left: number; top: number; width: number; height: number };
type Cell = { room: string; timeSlot: string };

/** A mouse drops where the pointer is; the keyboard has no pointer, so it drops where the card sits. */
export const boardCollisions: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

/** Space picks a card up and drops it; Enter stays "open" (it also drops); Escape or Tab put it back. */
export const boardKeyboardCodes: KeyboardCodes = {
  start: [KeyboardCode.Space],
  cancel: [KeyboardCode.Esc, KeyboardCode.Tab],
  end: [KeyboardCode.Space, KeyboardCode.Enter],
};

const STEPS: Partial<Record<string, [number, number]>> = {
  [KeyboardCode.Right]: [1, 0],
  [KeyboardCode.Left]: [-1, 0],
  [KeyboardCode.Down]: [0, 1],
  [KeyboardCode.Up]: [0, -1],
};

/**
 * The cell an arrow leads to from `from`: the nearest one ahead in that direction, keeping to the
 * same row or column first. Null at the edge of the board.
 */
export function nextCell(from: Box, cells: readonly Box[], [dx, dy]: [number, number]): Box | null {
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  let best: Box | null = null;
  let bestScore = Infinity;

  for (const cell of cells) {
    const x = cell.left + cell.width / 2 - fromX;
    const y = cell.top + cell.height / 2 - fromY;
    const ahead = dx ? x * dx : y * dy;
    if (ahead < (dx ? cell.width : cell.height) / 2) continue;
    const score = ahead + Math.abs(dx ? y : x) * 4;
    if (score < bestScore) {
      best = cell;
      bestScore = score;
    }
  }

  return best;
}

/** Arrow keys carry the card in hand one cell at a time, centred in it. */
export const cellKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const step = STEPS[event.code];
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!step || !collisionRect) return undefined;
  event.preventDefault();

  const cells = droppableContainers.getEnabled().flatMap((container) => {
    const rect = droppableRects.get(container.id);
    return rect ? [rect] : [];
  });
  const target = nextCell(collisionRect, cells, step);
  if (!target) return undefined;

  return {
    x: target.left + (target.width - collisionRect.width) / 2,
    y: target.top + (target.height - collisionRect.height) / 2,
  };
};

export const boardInstructions: ScreenReaderInstructions = {
  draggable:
    "Enter abre la charla. Para moverla, apretá espacio: las flechas la llevan de celda en celda, espacio la suelta y escape la deja donde estaba.",
};

/** What a screen reader hears while a card moves, in Spanish. `occupant` names who is in a cell. */
export function boardAnnouncements(occupant: (cell: Cell, exceptId: string) => string | null): Announcements {
  const noteOf = (active: Active) => active.data.current?.note as StickyNote | undefined;
  const title = (active: Active) => `«${noteOf(active)?.title ?? "la charla"}»`;
  const cellOf = (over: Over | null) => over?.data.current as Cell | undefined;
  const isHome = (active: Active, cell: Cell) =>
    cell.room === noteOf(active)?.room && cell.timeSlot === noteOf(active)?.timeSlot;
  const place = (active: Active, cell: Cell) => {
    const other = occupant(cell, String(active.id));
    return `${cell.room}, ${cell.timeSlot}${other ? ` (se intercambia con «${other}»)` : ""}`;
  };
  // A card picked up is over its own cell at once; saying so would talk over "Tomaste…".
  let justPicked = false;

  return {
    onDragStart: ({ active }) => {
      justPicked = true;
      return `Tomaste ${title(active)}.`;
    },
    onDragOver: ({ active, over }) => {
      const cell = cellOf(over);
      const wasJustPicked = justPicked;
      justPicked = false;
      if (!cell) return `${title(active)} está fuera de la grilla.`;
      if (isHome(active, cell)) return wasJustPicked ? undefined : `${title(active)} volvió a su lugar.`;

      return `${title(active)} sobre ${place(active, cell)}.`;
    },
    onDragEnd: ({ active, over }) => {
      const cell = cellOf(over);
      if (!cell || isHome(active, cell)) return `${title(active)} quedó donde estaba.`;

      return `Soltaste ${title(active)} en ${place(active, cell)}.`;
    },
    onDragCancel: ({ active }) => `Cancelaste: ${title(active)} quedó donde estaba.`,
  };
}
