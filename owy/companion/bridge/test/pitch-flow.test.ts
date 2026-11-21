import { expect, it } from "vitest";
import { draftFromCard, mergeAnswer, nextStep, type PitchDraft } from "../src/pitch-flow";

const card = {
  transcript: "Quiero hablar de Effect en producción",
  kind: "pitch" as const,
  title: "Effect en producción",
  titleSaid: true,
  speaker: null,
  nominated: false,
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
  // No title is never a title said; nobody named is nobody put forward.
  expect(draftFromCard({ ...card, kind: "unclear" })?.titleSaid).toBe(false);
  expect(draftFromCard({ ...card, nominated: true })?.nominated).toBe(false);
  expect(draftFromCard({ ...card, speaker: "Lucía", nominated: true })).toMatchObject({ speaker: "Lucía", nominated: true });
});

it("the topic is required, a made-up title is asked in the person's words, the name wanted; each once, only when the board can ask", () => {
  const cases: [Partial<PitchDraft>, boolean, ReturnType<typeof nextStep>][] = [
    [{ title: null }, true, { ask: "topic", line: "askTopic" }],
    [{ title: null, asked: ["topic"] }, true, { reject: "unclear" }],
    [{ title: null }, false, { reject: "unclear" }],
    [{}, true, { ask: "name", line: "askName" }],
    [{ asked: ["name"] }, true, { place: true }],
    [{}, false, { place: true }],
    [{ speaker: "Ana" }, true, { place: true }],
    // The topic first, then the name.
    [{ title: null, speaker: null }, true, { ask: "topic", line: "askTopic" }],
    [{ title: "X", speaker: null, asked: ["topic"] }, true, { ask: "name", line: "askName" }],
    // A title the model put together: asked once; unanswered, or no board to ask, it stays.
    [{ titleSaid: false, speaker: "Ana" }, true, { ask: "topic", line: "askTitle" }],
    [{ titleSaid: false }, true, { ask: "topic", line: "askTitle" }],
    [{ titleSaid: false, asked: ["topic"] }, true, { ask: "name", line: "askName" }],
    [{ titleSaid: false, speaker: "Ana", asked: ["topic"] }, true, { place: true }],
    [{ titleSaid: false }, false, { place: true }],
    // Not fit for the public board: turned away before anything is asked.
    [{ appropriate: false, title: null }, true, { reject: "declined" }],
    [{ appropriate: false }, true, { reject: "declined" }],
  ];
  for (const [over, canAsk, step] of cases) expect(nextStep(draft(over), canAsk)).toEqual(step);
});

it("an answer fills only what is missing, and only what it was asked about (anyone may say who gives it)", () => {
  const answer = { title: null, speaker: null, nominated: false, description: null, appropriate: true };
  const topic = mergeAnswer(draft({ title: null }), "topic", { ...answer, title: "Testing con IA", speaker: "Ana", description: "Cómo" });
  expect(topic).toMatchObject({ title: "Testing con IA", speaker: "Ana", description: "Cómo", asked: ["topic"] });

  const name = mergeAnswer(draft(), "name", { ...answer, title: "Otra cosa", speaker: " Ana Pérez ", description: "Otra" });
  expect(name).toMatchObject({ title: "Effect en producción", speaker: "Ana Pérez", nominated: false, description: null, asked: ["name"] });

  // Never overwrites what the pitch already said; nothing heard still counts as asked.
  expect(mergeAnswer(draft({ speaker: "Ana" }), "name", { ...answer, speaker: "Beto" }).speaker).toBe("Ana");
  // An offensive "name" spoils the whole card.
  expect(mergeAnswer(draft(), "name", { ...answer, speaker: "x", appropriate: false }).appropriate).toBe(false);
  expect(mergeAnswer(draft(), "name", null)).toMatchObject({ speaker: null, asked: ["name"] });
});

it("the person's own title replaces one the model put together, never one they said; the answer may put someone else forward", () => {
  const answer = { title: "Rust sin miedo", speaker: null, nominated: false, description: "Otra", appropriate: true };
  const madeUp = draft({ title: "Migrar a Rust", titleSaid: false, description: "Cómo migraron" });
  expect(mergeAnswer(madeUp, "topic", answer)).toMatchObject({ title: "Rust sin miedo", description: "Cómo migraron" });
  // Nothing usable in the answer: the model's title stays.
  expect(mergeAnswer(madeUp, "topic", { ...answer, title: " " }).title).toBe("Migrar a Rust");
  expect(mergeAnswer(draft(), "topic", answer).title).toBe("Effect en producción");

  expect(mergeAnswer(draft(), "name", { ...answer, speaker: "Lucía", nominated: true })).toMatchObject({ speaker: "Lucía", nominated: true });
});
