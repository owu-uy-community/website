import { describe, expect, test } from "vitest";

import { NO_SECRETS } from "../assets/schemas";
import { QuestionSchema } from "./schemas";

describe("a sign-up question", () => {
  // The ID's answers are masked and purged by their key: no other question may take it, and the ID
  // question can't drop its preset to unmask them
  test("only the ID question uses the id «ci»", () => {
    const parse = (question: object) =>
      QuestionSchema.safeParse({ label: "Pregunta", required: true, ...question }).success;

    expect([
      parse({ id: "ci", preset: "ci" }),
      parse({ id: "ci" }),
      parse({ id: "cedula", preset: "ci" }),
      parse({ id: "empresa" }),
    ]).toStrictEqual([true, false, false, true]);
  });
});

describe("the accounts registry", () => {
  test("refuses a password written down, in Spanish or English, and nothing else", () => {
    expect(
      [
        "contraseña: hunter2",
        "Contraseña = x",
        "clave: x",
        "password=1",
        "pwd: 1",
        "meetup.com/montevideojs",
        "La tiene Ana",
      ].map((value) => NO_SECRETS.test(value))
    ).toStrictEqual([true, true, true, true, true, false, false]);
  });
});
