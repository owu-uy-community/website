import { describe, expect, test } from "vitest";

import { rankQuestions, visibleQuestions } from "./questions";
import type { Moderation, StageInput } from "./scenes";

let clock = 0;
const question = (id: string, moderation: Moderation = ""): StageInput => ({
  id,
  key: "question",
  value: `¿Pregunta ${id}?`,
  voter: `phone-${id}`,
  createdAt: new Date(Date.UTC(2026, 10, 7, 19, 0, clock++)).toISOString(),
  moderation,
});
const votes = (id: string, count: number): StageInput[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${id}-vote-${index}`,
    key: `up:${id}`,
    value: "1",
    voter: `voter-${index}`,
    createdAt: new Date(Date.UTC(2026, 10, 7, 19, 30, clock++)).toISOString(),
    moderation: "",
  }));

describe(rankQuestions, () => {
  test("open questions go by votes, ties by who asked first", () => {
    const inputs = [question("a"), question("b"), question("c"), ...votes("b", 3), ...votes("c", 3)];

    expect(rankQuestions(inputs).map((q) => [q.id, q.votes])).toStrictEqual([
      ["b", 3],
      ["c", 3],
      ["a", 0],
    ]);
  });

  test("a pinned question leads even with no votes; answered ones go after the open ones", () => {
    const inputs = [question("open"), question("pinned", "pinned"), question("done", "answered"), ...votes("done", 9)];

    expect(rankQuestions(inputs).map((q) => q.id)).toStrictEqual(["pinned", "open", "done"]);
  });

  test("hidden questions come last for the desk, and never reach the wall", () => {
    const inputs = [question("spam", "hidden"), ...votes("spam", 20), question("kept")];

    expect(rankQuestions(inputs).map((q) => q.id)).toStrictEqual(["kept", "spam"]);
    expect(visibleQuestions(inputs).map((q) => q.id)).toStrictEqual(["kept"]);
  });

  test("votes are not questions", () => {
    expect(visibleQuestions([...votes("gone", 2)])).toStrictEqual([]);
  });
});
