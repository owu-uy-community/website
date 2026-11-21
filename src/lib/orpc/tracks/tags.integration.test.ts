import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { tracks } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { answeringModel, decidingModel, downModel, models } from "test/ai";
import { by } from "test/context";
import { makeBoard, makeSiteAdmin } from "test/factories";

// What runs after the response queues up here, and each test runs it when it wants to
const pending = vi.hoisted(() => [] as (() => Promise<unknown>)[]);
vi.mock(import("lib/later"), () => ({ later: (task: () => Promise<unknown>) => void pending.push(task) }));

async function afterResponse() {
  while (pending.length > 0) await pending.shift()?.();
}

async function setup() {
  const board = await makeBoard();
  const staff = await makeSiteAdmin();
  const card = {
    openSpaceId: board.event.id,
    scheduleId: board.slots.early.id,
    roomId: board.rooms.plain.id,
    title: "Kubernetes para Devs",
  };
  const publish = vi.spyOn(hub, "publish");
  const changes = () =>
    publish.mock.calls.filter(
      ([channel, name]) => channel === `event:${board.event.id}:sync` && name === "card_change"
    );
  const stored = async (id: string) =>
    (await db.select({ topics: tracks.topics, format: tracks.format }).from(tracks).where(eq(tracks.id, id)))[0];

  return { ...board, staff, card, changes, stored };
}

describe("«Para vos» tags", () => {
  beforeEach(() => {
    pending.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a new card answers at once with keyword tags; the model's arrive after the response, announced once", async () => {
    const { staff, card, changes, stored } = await setup();
    const model = answeringModel({ topics: ["devops", "backend"], format: "charla" });

    const note = await call(router.tracks.create, card, by(staff, { ai: models({ card: model }) }));

    // The response never waits on the gateway
    expect({ note, calls: model.doGenerateCalls.length, changes: changes().length }).toMatchObject({
      note: { topics: ["devops"], format: null },
      calls: 0,
      changes: 1,
    });

    await afterResponse();

    await expect(stored(note.id)).resolves.toStrictEqual({ topics: ["devops", "backend"], format: "charla" });
    expect(changes()).toHaveLength(2);
    expect(changes()[1][2]).toMatchObject({
      type: "CARD_UPDATE",
      payload: { updatedCard: { topics: ["devops", "backend"], format: "charla" } },
    });
  });

  test("with the gateway down the keyword tags stay, and nobody hears about it twice", async () => {
    const { staff, card, changes, stored } = await setup();
    const warn = vi.spyOn(console, "warn").mockReturnValue(undefined);

    const note = await call(router.tracks.create, card, by(staff, { ai: models({ card: downModel() }) }));
    await afterResponse();

    await expect(stored(note.id)).resolves.toStrictEqual({ topics: ["devops"], format: null });
    expect(changes()).toHaveLength(1);
    warn.mockRestore();
  });

  test("moving a card keeps its tags and asks no model; a new title is tagged again", async () => {
    const { staff, card, slots, stored } = await setup();
    const model = answeringModel({ topics: ["ia"], format: "debate" });
    const caller = by(staff, { ai: models({ card: model }) });
    const note = await call(router.tracks.create, card, caller);
    await afterResponse();

    await call(router.tracks.update, { id: note.id, data: { scheduleId: slots.late.id } }, caller);
    expect(pending).toHaveLength(0);

    const retitled = await call(
      router.tracks.update,
      { id: note.id, data: { title: "Agentes de IA en producción" } },
      caller
    );
    expect(retitled).toMatchObject({ topics: ["ia"], format: null });
    await afterResponse();

    expect(model.doGenerateCalls).toHaveLength(2);
    await expect(stored(note.id)).resolves.toStrictEqual({ topics: ["ia"], format: "debate" });
  });

  test("an answer about words the card no longer has is dropped", async () => {
    const { staff, card, stored } = await setup();
    const caller = by(staff, { ai: models({ card: answeringModel({ topics: ["devops"], format: "charla" }) }) });
    const note = await call(router.tracks.create, card, caller);
    const firstTagging = pending.shift();

    // The card is retitled before the first answer lands
    await call(router.tracks.update, { id: note.id, data: { title: "Diseño de producto" } }, caller);
    await firstTagging?.();

    await expect(stored(note.id)).resolves.toMatchObject({ topics: ["producto"] });
  });

  test("the companion's spoken pitch is tagged too", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T12:00:00.000Z"));
    const { staff, event, stored } = await setup();
    const model = answeringModel({ topics: ["datos"], format: "charla" });

    const placed = await call(
      router.tracks.createPlaced,
      { openSpaceId: event.id, title: "Postgres sin miedo", description: "Índices y planes" },
      by(staff, { ai: models({ card: model, pick: decidingModel(() => 0.1) }) })
    );
    await afterResponse();
    vi.useRealTimers();

    await expect(stored(placed.note.id)).resolves.toStrictEqual({ topics: ["datos"], format: "charla" });
  });
});
