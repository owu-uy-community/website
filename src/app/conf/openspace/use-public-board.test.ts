import { describe, expect, test } from "vitest";

import type { StickyNote } from "lib/orpc";

import { applyCardChange } from "./use-public-board";

const card = (id: string, room: string, timeSlot = "16:00 - 16:25") =>
  ({ id, title: id, room, timeSlot, roomId: room, scheduleId: timeSlot }) as StickyNote;
const board = [card("a", "Lobby"), card("b", "Cueva")];

describe(applyCardChange, () => {
  test("a create appends once, an update and a delete apply in place, a swap puts both where they ended", () => {
    const created = applyCardChange(board, { type: "CARD_CREATE", payload: { updatedCard: card("c", "Centro") } });
    expect(created?.map((t) => t.id)).toStrictEqual(["a", "b", "c"]);
    expect(applyCardChange(created!, { type: "CARD_CREATE", payload: { updatedCard: card("c", "Centro") } })).toBe(
      created
    );

    const moved = card("a", "Rincón");
    expect(applyCardChange(board, { type: "CARD_UPDATE", payload: { updatedCard: moved } })?.[0]).toBe(moved);
    expect(applyCardChange(board, { type: "CARD_DELETE", payload: { cardId: "a" } })?.map((t) => t.id)).toStrictEqual([
      "b",
    ]);

    const swapped = applyCardChange(board, {
      type: "CARD_SWAP",
      payload: { updatedCards: [card("a", "Cueva"), card("b", "Lobby")] },
    });
    expect(swapped?.map((t) => `${t.id}@${t.room}`)).toStrictEqual(["a@Cueva", "b@Lobby"]);
  });

  test("a change to a card this screen never got asks for a re-read", () => {
    expect(applyCardChange(board, { type: "CARD_UPDATE", payload: { updatedCard: card("x", "Lobby") } })).toBeNull();
    expect(
      applyCardChange(board, { type: "CARD_SWAP", payload: { updatedCards: [card("a", "Cueva"), card("x", "Lobby")] } })
    ).toBeNull();
  });
});
