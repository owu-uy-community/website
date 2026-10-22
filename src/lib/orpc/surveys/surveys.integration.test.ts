import { call } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { describe, expect, test } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeMember, makeRoom, makeSiteAdmin } from "test/factories";

async function setup() {
  const board = await makeBoard();
  const admin = await makeSiteAdmin();
  const survey = await call(router.surveys.upsert, { eventId: board.event.id }, by(admin));
  const open = () => call(router.surveys.upsert, { eventId: board.event.id, isOpen: true }, by(admin));
  const answer = (answers: Record<string, string | number>, more: { roomId?: string; respondent?: string } = {}) =>
    call(
      router.surveys.respond,
      { surveyId: survey.id, respondent: more.respondent ?? createId(), roomId: more.roomId, answers },
      by(null)
    );

  return { ...board, eventId: board.event.id, admin, survey, open, answer };
}

describe("writing the survey", () => {
  test("a new survey starts closed, with the six default questions", async () => {
    const { survey, event, community } = await setup();

    expect(survey).toMatchObject({ isOpen: false, responses: 0, title: `¿Qué te pareció ${event.name}?` });
    expect(survey.questions.map((question) => question.kind)).toStrictEqual([
      "nps",
      "text",
      "rating",
      "rating",
      "choice",
      "text",
    ]);
    // Closed: phones don't see it.
    await expect(
      call(router.surveys.public, { communitySlug: community.slug, eventSlug: event.slug }, by(null))
    ).resolves.toBeNull();
  });

  test("only site staff write it or read its results", async () => {
    const { eventId, community } = await setup();
    const owner = await makeMember(community.id, "owner");

    await expect(call(router.surveys.upsert, { eventId, isOpen: true }, by(owner))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.surveys.results, { eventId }, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("questions are checked: at most eight, choices need two options", async () => {
    const { eventId, admin } = await setup();
    const question = { id: "q", kind: "text" as const, label: "¿Qué tal?" };

    await expect(
      call(
        router.surveys.upsert,
        { eventId, questions: [{ id: "c", kind: "choice", label: "¿Sí?", options: ["Sí"] }] },
        by(admin)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(
        router.surveys.upsert,
        { eventId, questions: Array.from({ length: 9 }, (_, index) => ({ ...question, id: `q${index}` })) },
        by(admin)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(router.surveys.upsert, { eventId, questions: [question, question] }, by(admin))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("an open survey reaches phones without anything about who answered", async () => {
    const { event, community, rooms, open, answer } = await setup();
    await open();
    await answer({ nps: 10 });

    const survey = await call(
      router.surveys.public,
      { communitySlug: community.slug, eventSlug: event.slug },
      by(null)
    );

    expect(Object.keys(survey ?? {}).toSorted()).toStrictEqual([
      "communityName",
      "eventName",
      "id",
      "questions",
      "rooms",
      "title",
    ]);
    expect(survey?.rooms.map((room) => room.id)).toStrictEqual([rooms.plain.id, rooms.tv.id]);
  });
});

describe("answering", () => {
  test("answers must fit their questions", async () => {
    const { open, answer } = await setup();
    await open();
    const elsewhere = await makeBoard();
    const foreignRoom = await makeRoom(elsewhere.event.id);

    const wrong: Record<string, string | number>[] = [
      { nps: 11 },
      { nps: 7.5 },
      { "open-space": 0 },
      { volverias: "Nunca" },
      { otra: "x" },
      {},
    ];
    for (const answers of wrong) {
      await expect(answer(answers)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(answer({ nps: 9 }, { roomId: foreignRoom.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Blank comments don't count as an answer.
    await expect(answer({ comentarios: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("a closed survey takes no answers", async () => {
    const { answer } = await setup();

    await expect(answer({ nps: 9 })).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "survey_closed" } });
  });

  test("one answer per phone and room", async () => {
    const { rooms, open, answer } = await setup();
    await open();
    const respondent = createId();

    await answer({ nps: 9 }, { respondent });
    await expect(answer({ nps: 3 }, { respondent })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_answered" },
    });
    // The same phone may still rate each room once.
    await answer({ nps: 8 }, { respondent, roomId: rooms.plain.id });
    await expect(answer({ nps: 8 }, { respondent, roomId: rooms.plain.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await answer({ nps: 7 }, { respondent, roomId: rooms.tv.id });
  });
});

describe("results", () => {
  /** Five answers: three on the general link, two from the plain room's QR. */
  async function answered() {
    const context = await setup();
    const { rooms, open, answer } = context;
    await open();
    const plain = { roomId: rooms.plain.id };
    await answer({ nps: 10, "open-space": 5, volverias: "Sí, seguro", "te-llevas": "Ideas" }, plain);
    await answer({ nps: 10, "open-space": 4, volverias: "Sí, seguro" }, plain);
    await answer({ nps: 9, "open-space": 4, charlas: 2, volverias: "Capaz" });
    await answer({ nps: 7, charlas: 3 });
    await answer({ nps: 3, "te-llevas": "Amigos nuevos" });
    const results = await call(router.surveys.results, { eventId: context.eventId }, by(context.admin));

    return { ...context, results, byId: new Map(results?.questions.map((question) => [question.id, question])) };
  }

  test("the NPS counts promoters minus detractors", async () => {
    const { results, byId } = await answered();

    // 3 promoters, 1 passive, 1 detractor out of 5: (3 − 1) / 5 = 40.
    expect(results).toMatchObject({ responses: 5, nps: 40 });
    expect(byId.get("nps")).toMatchObject({
      kind: "nps",
      answered: 5,
      score: 40,
      promoters: 3,
      passives: 1,
      detractors: 1,
      distribution: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 2],
    });
  });

  test("ratings average, choices count, comments come newest first", async () => {
    const { rooms, byId } = await answered();

    expect(byId.get("open-space")).toMatchObject({
      kind: "rating",
      answered: 3,
      average: 4.3,
      distribution: [0, 0, 0, 2, 1],
    });
    expect(byId.get("charlas")).toMatchObject({ kind: "rating", average: 2.5 });
    expect(byId.get("volverias")).toMatchObject({
      kind: "choice",
      options: [
        { label: "Sí, seguro", count: 2 },
        { label: "Capaz", count: 1 },
        { label: "No", count: 0 },
      ],
    });
    const comments = byId.get("te-llevas");
    expect(comments?.kind === "text" && comments.latest.map((entry) => [entry.text, entry.room])).toStrictEqual([
      ["Amigos nuevos", null],
      ["Ideas", rooms.plain.name],
    ]);
  });

  test("each room has its own numbers, and so does the general link", async () => {
    const { eventId, admin, rooms, results } = await answered();

    expect(results?.rooms).toStrictEqual([
      { roomId: null, name: "Link general", responses: 3, nps: 0, rating: 3 },
      { roomId: rooms.plain.id, name: rooms.plain.name, responses: 2, nps: 100, rating: 4.5 },
      { roomId: rooms.tv.id, name: rooms.tv.name, responses: 0, nps: null, rating: null },
    ]);
    await expect(call(router.surveys.get, { eventId }, by(admin))).resolves.toMatchObject({ responses: 5 });
  });

  test("an event without a survey has no results", async () => {
    const board = await makeBoard();
    const admin = await makeSiteAdmin();

    await expect(call(router.surveys.results, { eventId: board.event.id }, by(admin))).resolves.toBeNull();
    await expect(call(router.surveys.get, { eventId: board.event.id }, by(admin))).resolves.toBeNull();
  });
});

describe("starting over", () => {
  test("clearing the answers keeps the questions; deleting the survey lets the event start a new one", async () => {
    const { eventId, admin, open, answer } = await setup();
    await open();
    await answer({ nps: 9 });
    await answer({ nps: 3 });
    const edited = await call(router.surveys.upsert, { eventId, title: "¿Qué tal?" }, by(admin));

    const cleared = await call(router.surveys.clearResponses, { eventId }, by(admin));
    await call(router.surveys.delete, { eventId }, by(admin));
    const gone = await call(router.surveys.get, { eventId }, by(admin));
    const fresh = await call(router.surveys.upsert, { eventId }, by(admin));

    expect(cleared).toMatchObject({ id: edited.id, title: "¿Qué tal?", responses: 0 });
    expect(gone).toBeNull();
    expect(fresh).toMatchObject({ responses: 0, isOpen: false });
    expect(fresh.id).not.toBe(edited.id);
  });

  test("only site staff clear or delete it; without a survey there is nothing to delete", async () => {
    const { eventId, community, admin } = await setup();
    const owner = await makeMember(community.id, "owner");

    await expect(call(router.surveys.delete, { eventId }, by(owner))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.surveys.clearResponses, { eventId }, by(owner))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await call(router.surveys.delete, { eventId }, by(admin));
    await expect(call(router.surveys.delete, { eventId }, by(admin))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
