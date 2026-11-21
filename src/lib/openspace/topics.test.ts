import { describe, expect, test } from "vitest";

import { matchTrack, tagsOf, topicsFromText } from "./topics";

describe("topicsFromText (the keyword fallback)", () => {
  test("tags the board's usual titles", () => {
    expect(topicsFromText("Next.js 15: Server Components")).toStrictEqual(["frontend"]);
    expect(topicsFromText("RAG: Retrieval Augmented Generation")).toContain("ia");
    expect(topicsFromText("Neural Networks: Conceptos Básicos")).toContain("ia");
    expect(topicsFromText("Charla sobre DISEÑO de producto")).toContain("producto");
    expect(topicsFromText("Una charla sobre nada en particular")).toStrictEqual([]);
  });

  test("matches at a word start: «ci» inside «ciberseguridad» is not DevOps", () => {
    expect(topicsFromText("Metodología Forense Digital: análisis forense en ciberseguridad")).toStrictEqual([
      "seguridad",
    ]);
    expect(topicsFromText("CI/CD moderno con GitHub Actions")).toContain("devops");
    expect(topicsFromText("Guía de Uruguay")).toStrictEqual([]);
  });

  test("longer keywords still catch their stems", () => {
    expect(topicsFromText("Introducción al Pentesting")).toContain("seguridad");
    expect(topicsFromText("Diseñando APIs que duren")).toContain("backend");
  });
});

describe(matchTrack, () => {
  test("topic overlap dominates; the session's shape only breaks ties", () => {
    const twoTopics = matchTrack({ topics: ["ia", "datos"], format: "charla" }, ["ia", "datos"], "debatir");
    const oneTopicRightShape = matchTrack({ topics: ["ia"], format: "debate" }, ["ia", "datos"], "debatir");

    expect(twoTopics.score).toBeGreaterThan(oneTopicRightShape.score);
    expect(twoTopics).toMatchObject({ matched: ["ia", "datos"], suitsGoal: false });
    expect(oneTopicRightShape.suitsGoal).toBe(true);
    expect(matchTrack({ topics: ["ia"], format: "debate" }, ["ia"], "debatir").score).toBeGreaterThan(
      matchTrack({ topics: ["ia"], format: "charla" }, ["ia"], "debatir").score
    );
  });

  test("no topic in common scores zero, even in the format they came for", () => {
    expect(matchTrack({ topics: ["mobile"], format: "charla" }, ["ia"], "aprender").score).toBe(0);
    expect(matchTrack(undefined, ["ia"], "aprender").score).toBe(0);
  });
});

describe(tagsOf, () => {
  test("stored tags win; unknown ones are dropped", () => {
    expect(tagsOf({ title: "Next.js", topics: ["ia", "nope"], format: "debate" })).toStrictEqual({
      topics: ["ia"],
      format: "debate",
    });
  });

  test("a card from before tagging falls back to keywords, with no format", () => {
    expect(tagsOf({ title: "Intro a Machine Learning", topics: null, format: "inventado" })).toStrictEqual({
      topics: ["ia"],
      format: null,
    });
  });
});
