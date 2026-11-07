import { expect, it } from "vitest";
import { draftFromCard, mergeAnswer, nextStep, type PitchDraft } from "../src/pitch-flow";

const card = {
  transcript: "Quiero hablar de Effect en producción",
  kind: "pitch" as const,
  title: "Effect en producción",
  speaker: null,
  needsTV: false,
  needsWhiteboard: true,
  description: null,
  topics: ["effect"],
  reaction: null,
  appropriate: true,
};

const draft = (over: Partial<PitchDraft> = {}): PitchDraft => ({ ...draftFromCard(card)!, ...over });

it("a greeting or silence is no draft; an unclear topic has no title, whatever the model wrote", () => {
  expect(draftFromCard({ ...card, kind: "not_pitch" })).toBeNull();
  expect(draftFromCard({ ...card, transcript: "  " })).toBeNull();
  expect(draftFromCard({ ...card, kind: "unclear" })?.title).toBeNull();
  expect(draftFromCard({ ...card, speaker: "  ", description: "" })).toMatchObject({ speaker: null, description: null });
});

it("the topic is required and the name wanted; each is asked once, and only when the board can ask", () => {
  const cases: [Partial<PitchDraft>, boolean, ReturnType<typeof nextStep>][] = [
    [{ title: null }, true, { ask: "topic" }],
    [{ title: null, asked: ["topic"] }, true, { reject: "unclear" }],
    [{ title: null }, false, { reject: "unclear" }],
    [{}, true, { ask: "name" }],
    [{ asked: ["name"] }, true, { place: true }],
    [{}, false, { place: true }],
    [{ speaker: "Ana" }, true, { place: true }],
    // The topic first, then the name.
    [{ title: null, speaker: null }, true, { ask: "topic" }],
    [{ title: "X", speaker: null, asked: ["topic"] }, true, { ask: "name" }],
    // Not fit for the public board: turned away before anything is asked.
    [{ appropriate: false, title: null }, true, { reject: "declined" }],
    [{ appropriate: false }, true, { reject: "declined" }],
  ];
  for (const [over, canAsk, step] of cases) expect(nextStep(draft(over), canAsk)).toEqual(step);
});

it("an answer fills only what is missing, and only what it was asked about (anyone may say their name)", () => {
  const topic = mergeAnswer(draft({ title: null }), "topic", { title: "Testing con IA", speaker: "Ana", description: "Cómo", appropriate: true });
  expect(topic).toMatchObject({ title: "Testing con IA", speaker: "Ana", description: "Cómo", asked: ["topic"] });

  const name = mergeAnswer(draft(), "name", { title: "Otra cosa", speaker: " Ana Pérez ", description: "Otra", appropriate: true });
  expect(name).toMatchObject({ title: "Effect en producción", speaker: "Ana Pérez", description: null, asked: ["name"] });

  // Never overwrites what the pitch already said; nothing heard still counts as asked.
  expect(mergeAnswer(draft({ speaker: "Ana" }), "name", { title: null, speaker: "Beto", description: null, appropriate: true }).speaker).toBe("Ana");
  // An offensive "name" spoils the whole card.
  expect(mergeAnswer(draft(), "name", { title: null, speaker: "x", description: null, appropriate: false }).appropriate).toBe(false);
  expect(mergeAnswer(draft(), "name", null)).toMatchObject({ speaker: null, asked: ["name"] });
});
