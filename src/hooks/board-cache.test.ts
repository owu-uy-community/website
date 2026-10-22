import { describe, expect, test } from "vitest";

import type { StickyNote } from "../lib/orpc";

import { settleCreatedCard, withCreatedCard } from "./board-cache";

const note = (id: string, title: string, room = "Centro", timeSlot = "16:00 - 16:25") =>
  ({ id, title, room, timeSlot }) as StickyNote;

describe("a created card on the screen that made it", () => {
  test("the broadcast landing before the create's answer replaces the optimistic card, never doubles it", () => {
    const optimistic = note("temp-1", "Volveré");
    const real = note("t1", "Volveré");

    const afterBroadcast = withCreatedCard([note("t0", "Otra", "Cueva"), optimistic], real);
    expect(afterBroadcast.map((card) => card.id)).toStrictEqual(["t0", "t1"]);
    expect(settleCreatedCard(afterBroadcast, real, "temp-1").map((card) => card.id)).toStrictEqual(["t0", "t1"]);
  });

  test("the answer landing first swaps the optimistic card, and the late broadcast changes nothing", () => {
    const real = note("t1", "Volveré");
    const settled = settleCreatedCard([note("temp-1", "Volveré")], real, "temp-1");

    expect(settled.map((card) => card.id)).toStrictEqual(["t1"]);
    expect(withCreatedCard(settled, real)).toBe(settled);
  });

  test("a card created on another screen is added, even next to an optimistic card elsewhere", () => {
    const theirs = note("t2", "Ajena", "Lobby");

    expect(withCreatedCard([note("temp-1", "Mía")], theirs).map((card) => card.id)).toStrictEqual(["temp-1", "t2"]);
  });
});
