import { describe, expect, test } from "vitest";

import { ProposalFieldsSchema, SubmitMaterialsSchema } from "../orpc/talks/schemas";
import { addressedTo, claimState, speakerEmailDue, withoutTalk, withTalk } from "./talks";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("a proposal", () => {
  const valid = {
    speakerName: "Ana",
    title: "Testing sin dolor",
    abstract: "Cómo escribir tests que no se rompen cada vez que cambia un botón.",
    format: "relampago",
    level: "inicial",
    topics: ["testing"],
    language: "es",
    firstTime: true,
    recordingOk: false,
    communityIds: [],
  };
  const issues = (input: object) =>
    ProposalFieldsSchema.safeParse(input).error?.issues.map((issue) => [issue.path.join("."), issue.message]) ?? [];

  test("takes a complete proposal, notes optional, to any of OWU", () => {
    expect(ProposalFieldsSchema.parse(valid)).toStrictEqual({ ...valid, notes: "" });
  });

  test("says how to fix each field", () => {
    expect(issues({ ...valid, title: "Hola", abstract: "corto", topics: [] })).toStrictEqual([
      ["title", "Poné un título de al menos 5 letras"],
      ["abstract", "Contá de qué va en unas líneas (30 letras o más)"],
      ["topics", "Elegí al menos un tema"],
    ]);
  });

  test("only catalogue topics, formats and levels", () => {
    expect(issues({ ...valid, topics: ["blockchain"] })).toHaveLength(1);
    expect(issues({ ...valid, format: "keynote" })).toHaveLength(1);
    expect(issues({ ...valid, level: "experto" })).toHaveLength(1);
  });
});

describe("the materials form", () => {
  test("needs at least one https link", () => {
    expect(SubmitMaterialsSchema.safeParse({ token: "t" }).success).toBe(false);
    expect(SubmitMaterialsSchema.safeParse({ token: "t", slides: "http://example.com" }).success).toBe(false);
    expect(SubmitMaterialsSchema.safeParse({ token: "t", recording: "https://example.com/v" }).success).toBe(true);
  });
});

describe(addressedTo, () => {
  test("open proposals to the community or to any of OWU", () => {
    expect(addressedTo({ status: "open", communityIds: [] }, "a")).toBe(true);
    expect(addressedTo({ status: "open", communityIds: ["a", "b"] }, "a")).toBe(true);
    expect(addressedTo({ status: "open", communityIds: ["b"] }, "a")).toBe(false);
    expect(addressedTo({ status: "withdrawn", communityIds: [] }, "a")).toBe(false);
  });
});

describe(claimState, () => {
  test("free, ours, or taken by another community by name", () => {
    expect(claimState(null, "a")).toStrictEqual({ kind: "free" });
    expect(claimState({ communityId: "a", communityName: "Python" }, "a")).toStrictEqual({ kind: "ours" });
    expect(claimState({ communityId: "b", communityName: "Datos" }, "a")).toStrictEqual({ kind: "taken", by: "Datos" });
  });
});

describe(withTalk, () => {
  test("adds a talk once, whatever the case or spaces", () => {
    const talks = [{ title: "Testing sin dolor", speaker: "Ana" }];
    expect(withTalk(talks, { title: " testing SIN dolor ", speaker: "ana" })).toStrictEqual(talks);
    expect(withTalk(talks, { title: "Otra", speaker: "Ana" })).toHaveLength(2);
    expect(withoutTalk(talks, { title: "testing sin dolor", speaker: "ANA" })).toStrictEqual([]);
  });
});

describe(speakerEmailDue, () => {
  const now = Date.UTC(2026, 10, 1, 12);
  const event = (startsIn: number, hours = 2) => ({
    startDate: new Date(now + startsIn),
    endDate: new Date(now + startsIn + hours * HOUR),
  });

  test("two weeks out, the last two days, and the week after the day after", () => {
    const starts = [15 * DAY, 14 * DAY, 2 * DAY + 1, 2 * DAY, 1, -HOUR, -DAY - 2 * HOUR, -8 * DAY - 2 * HOUR];
    expect(starts.map((startsIn) => speakerEmailDue(event(startsIn), now))).toStrictEqual([
      null,
      "t14",
      "t14",
      "t2",
      "t2",
      null,
      "t1",
      null,
    ]);
  });
});
