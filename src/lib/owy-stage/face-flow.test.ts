import { describe, expect, test } from "vitest";

import type { StickyNote } from "../orpc/tracks/schemas";
import {
  CARD_MS,
  DEDUPE_MS,
  EXPRESSION_MS,
  RECENT_CREATE_MS,
  initialFlow,
  nextTick,
  reduceFlow,
  type CardChange,
  type Flow,
} from "./face-flow";
import type { FaceEvent } from "./scenes";

const T0 = 1_700_000_000_000;

const face = (flow: Flow, event: FaceEvent, now = T0) =>
  reduceFlow(flow, { type: "face", face: event, now, captions: true });

const created = (overrides: Partial<StickyNote> = {}, now = T0): CardChange => ({
  type: "CARD_CREATE",
  payload: {
    updatedCard: {
      id: "t1",
      title: "Effect en producción",
      speaker: "Ana",
      needsTV: false,
      needsWhiteboard: false,
      openSpaceId: "e1",
      scheduleId: "s1",
      roomId: "r1",
      room: "Cueva",
      roomColor: "#112233",
      timeSlot: "15:00 - 15:45",
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      ...overrides,
    },
  },
});

describe("the Owy scene's flow", () => {
  test("the same speaker keeps typing into one caption; a new speaker gets a fresh one", () => {
    let flow = face(initialFlow(), { state: "listening", transcript: { who: "input", text: "Quiero" } });
    flow = face(flow, { state: "listening", transcript: { who: "input", text: "Quiero proponer" } }, T0 + 300);
    const key = flow.transcript?.key;
    flow = face(flow, { state: "speaking", transcript: { who: "output", text: "Dale" } }, T0 + 2000);

    expect(key).toBe(`input-${T0}`);
    expect(flow.transcript).toStrictEqual({ key: `output-${T0 + 2000}`, who: "output", text: "Dale" });
  });

  test("captions off ignores transcripts but not the card", () => {
    const flow = reduceFlow(initialFlow(), {
      type: "face",
      face: { state: "speaking", transcript: { who: "output", text: "Hola" } },
      now: T0,
      captions: false,
    });
    const landed = reduceFlow(flow, {
      type: "face",
      face: { state: "happy", card: { title: "X" } },
      now: T0,
      captions: false,
    });

    expect(flow.transcript).toBeNull();
    expect(landed.landed).toMatchObject({ title: "X", key: "X||", at: T0 });
  });

  test("the card takes the transcript's place: what was said is a talk on the board now", () => {
    let flow = face(initialFlow(), {
      state: "listening",
      transcript: { who: "input", text: "Quiero hablar de Effect" },
    });
    flow = face(flow, { state: "happy", card: { title: "Effect", room: "Cueva" } }, T0 + 9000);

    expect(flow.transcript).toBeNull();
    expect(flow.landed?.key).toBe("Effect|Cueva|");
  });

  test("going back to listening is a new turn: card, feeling and caption are gone", () => {
    let flow = face(initialFlow(), {
      state: "speaking",
      expression: { name: "happy", strength: 90 },
      card: { title: "X" },
    });
    flow = face(flow, { state: "speaking", transcript: { who: "output", text: "Queda en Cueva" } }, T0 + 100);
    expect(flow.landed).not.toBeNull();

    // Transcript updates while already listening do not restart the turn.
    flow = face(flow, { state: "listening" }, T0 + 500);
    const cleared = flow;
    flow = face(flow, { state: "listening", transcript: { who: "input", text: "Hola" } }, T0 + 600);
    flow = face(flow, { state: "listening", transcript: { who: "input", text: "Hola, soy" } }, T0 + 900);

    expect(cleared).toMatchObject({ landed: null, expression: null, transcript: null });
    expect(flow.transcript).toStrictEqual({ key: `input-${T0 + 600}`, who: "input", text: "Hola, soy" });
  });

  test("a fresh CARD_CREATE lands with its ids; an old one is ignored", () => {
    const landed = reduceFlow(initialFlow(), { type: "card_change", change: created(), now: T0 + 4000 });
    const stale = reduceFlow(initialFlow(), {
      type: "card_change",
      change: created({}, T0 - RECENT_CREATE_MS - 1000),
      now: T0,
    });

    expect(landed.landed).toMatchObject({
      title: "Effect en producción",
      speaker: "Ana",
      room: "Cueva",
      timeSlot: "15:00 - 15:45",
      roomId: "r1",
      scheduleId: "s1",
      roomColor: "#112233",
      at: T0 + 4000,
    });
    expect(stale.landed).toBeNull();
  });

  test("the companion's card and the board's event for the same talk are one landing", () => {
    let flow = face(initialFlow(), {
      state: "happy",
      card: { title: "Effect en producción", room: "Cueva", timeSlot: "15:00 - 15:45" },
    });
    flow = reduceFlow(flow, { type: "card_change", change: created(), now: T0 + DEDUPE_MS - 500 });

    expect(flow.landed).toMatchObject({ key: "Effect en producción|Cueva|15:00 - 15:45", at: T0, roomId: "r1" });
  });

  test("a card and a feeling expire on the clock", () => {
    let flow = face(initialFlow(), {
      state: "speaking",
      expression: { name: "surprised", strength: 70 },
      card: { title: "X" },
    });
    expect(nextTick(flow)).toBe(T0 + EXPRESSION_MS);

    flow = reduceFlow(flow, { type: "tick", now: T0 + EXPRESSION_MS });
    expect(flow).toMatchObject({ expression: null, landed: { title: "X" } });
    expect(nextTick(flow)).toBe(T0 + CARD_MS);

    flow = reduceFlow(flow, { type: "tick", now: T0 + CARD_MS });
    expect(flow.landed).toBeNull();
    expect(nextTick(flow)).toBeNull();
  });

  test("a caption clears by its key only", () => {
    let flow = face(initialFlow(), { state: "speaking", transcript: { who: "output", text: "Wow" } });

    flow = reduceFlow(flow, { type: "clear_transcript", key: "other" });
    expect(flow.transcript).not.toBeNull();
    flow = reduceFlow(flow, { type: "clear_transcript", key: `output-${T0}` });
    expect(flow.transcript).toBeNull();
  });
});
