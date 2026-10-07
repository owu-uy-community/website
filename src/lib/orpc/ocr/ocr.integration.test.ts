import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { downModel, generatingModel, models, streamingModel } from "test/ai";
import { by } from "test/context";
import { makeBoard, makeSiteAdmin, makeTrack, makeUser } from "test/factories";

const PHOTO = "data:image/jpeg;base64,/9j/4AAQ";

/** The read of a card naming Ana and "Effect", asking for a TV, in the pieces a model would stream it. */
const anaCard = () =>
  streamingModel([
    '{"transcripcion":"Ana · Effect","speaker":"An',
    'a","title":"Eff',
    'ect","requisito":"tv","revisar":[]}',
  ]);

async function setup() {
  const board = await makeBoard();
  await makeTrack({ eventId: board.event.id, scheduleId: board.slots.early.id, roomId: board.rooms.plain.id });
  const staff = await makeSiteAdmin();
  // Before the day starts, so every block is still ahead.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00:00.000Z"));

  return { ...board, eventId: board.event.id, staff };
}

async function drain<T>(events: AsyncIterable<T>) {
  const seen: T[] = [];
  for await (const event of events) seen.push(event);

  return seen;
}

describe("reading a card", () => {
  test("the name and title stream in as they are read, then the card, then a place for it", async () => {
    const { eventId, rooms, staff } = await setup();
    const pick = generatingModel({ candidato: "c0", razon: "Libre y con TV.", alternativas: [] });

    const events = await drain(
      await call(
        router.ocr.extractCard,
        { eventId, imageData: PHOTO },
        by(staff, { ai: models({ card: anaCard(), pick }) })
      )
    );

    expect(events.filter((event) => event.type === "fields").at(-1)).toStrictEqual({
      type: "fields",
      fields: { title: "Effect", speaker: "Ana" },
    });
    expect(events.find((event) => event.type === "card")).toMatchObject({
      card: { title: "Effect", speaker: "Ana", needsTV: true, needsWhiteboard: false },
    });
    // The only room with a TV, in the emptier block.
    expect(events.at(-1)).toStrictEqual({
      type: "suggestion",
      suggestion: {
        suggestedRoom: rooms.tv.name,
        suggestedTimeSlot: "16:00 - 16:45",
        reasoning: "Libre y con TV.",
        alternatives: [],
      },
    });
  });

  test("#12 a model outage while reading is a BAD_GATEWAY that says why", async () => {
    const { eventId, staff } = await setup();

    await expect(
      drain(
        await call(
          router.ocr.extractCard,
          { eventId, imageData: PHOTO },
          by(staff, { ai: models({ card: downModel() }) })
        )
      )
    ).rejects.toMatchObject({ code: "BAD_GATEWAY", message: expect.stringContaining("Service Unavailable") });
    await expect(
      call(
        router.ocr.processImageWithSuggestion,
        { eventId, imageData: PHOTO },
        by(staff, { ai: models({ card: downModel() }) })
      )
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });

  test("a photo for an unknown event is NOT_FOUND before any model is paid", async () => {
    const { staff } = await setup();
    const card = anaCard();

    await expect(
      drain(
        await call(
          router.ocr.extractCard,
          { eventId: "no-existe", imageData: PHOTO },
          by(staff, { ai: models({ card }) })
        )
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(card.doStreamCalls).toHaveLength(0);
  });

  test("#P3 a photo larger than a request can carry is a BAD_REQUEST before any model is called", async () => {
    const { eventId, staff } = await setup();
    const tooBig = `data:image/jpeg;base64,${"A".repeat(6_000_000)}`;

    await expect(call(router.ocr.extractCard, { eventId, imageData: tooBig }, by(staff))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("Owy's one-shot read places the card too", async () => {
    const { eventId, rooms, staff } = await setup();
    const pick = generatingModel({ candidato: "c0", razon: "Libre y con TV.", alternativas: [] });

    await expect(
      call(
        router.ocr.processImageWithSuggestion,
        { eventId, imageData: PHOTO },
        by(staff, { ai: models({ card: anaCard(), pick }) })
      )
    ).resolves.toMatchObject({ title: "Effect", speaker: "Ana", needsTV: true, suggestedRoom: rooms.tv.name });
  });
});

describe("placing a talk", () => {
  test("with the models down, a slot is still offered, marked as degraded", async () => {
    const { eventId, rooms, staff } = await setup();

    const suggestion = await call(
      router.ocr.findFreeSpot,
      { eventId, title: "Effect", speaker: "Ana" },
      by(staff, { ai: models({ pick: downModel() }) })
    );

    expect(suggestion).toMatchObject({
      degraded: true,
      suggestedRoom: rooms.plain.name,
      suggestedTimeSlot: "16:00 - 16:45",
    });
  });

  test("blocks that already ended on the event's clock are not offered", async () => {
    const { eventId, staff } = await setup();
    // 15:50 in Montevideo: the 15:00 block is over.
    vi.setSystemTime(new Date("2026-11-07T18:50:00.000Z"));
    const pick = generatingModel({ candidato: "c0", razon: "Lo que queda.", alternativas: [] });

    const suggestion = await call(
      router.ocr.findFreeSpot,
      { eventId, title: "Tarde" },
      by(staff, { ai: models({ pick }) })
    );

    expect(suggestion.suggestedTimeSlot).toBe("16:00 - 16:45");
    expect(JSON.stringify(pick.doGenerateCalls[0]?.prompt)).not.toContain("15:00 - 15:45 (");
  });

  test("card reading and slot picking are staff-only", async () => {
    const { eventId } = await setup();
    const user = await makeUser();

    await expect(call(router.ocr.extractCard, { eventId, imageData: PHOTO }, by(user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.ocr.findFreeSpot, { eventId, title: "X" }, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
