/** One cell of the board: a room in a block. Shared by the map, the grid and the lists. */
export type Selection = { roomId: string; scheduleId: string };

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  return a?.roomId === b?.roomId && a?.scheduleId === b?.scheduleId;
}
