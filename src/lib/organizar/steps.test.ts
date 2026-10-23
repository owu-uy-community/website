import { describe, expect, test } from "vitest";

import { issues, stepState, UNTITLED, type Checkable } from "./steps";

const ready: Checkable = {
  name: "Python Montevideo: cierre del año",
  summary: "Charlas cortas y pizza",
  description: "Tres charlas de 20 minutos.",
  format: "charlas",
  topics: ["lenguajes"],
  dateChosen: true,
  startDate: "2029-11-26T22:00:00.000Z",
  mode: "presencial",
  venueId: "venue",
  placeName: null,
  onlineUrl: null,
  registration: "owu",
  registrationUrl: null,
  capacity: 60,
  responders: ["responder"],
};
const NOW = Date.parse("2029-11-01T00:00:00Z");

describe(issues, () => {
  test("a complete event has nothing left", () => {
    expect(issues(ready, NOW)).toStrictEqual([]);
  });

  test("a fresh draft needs a name, a summary and a date before publishing", () => {
    const draft = { ...ready, name: UNTITLED, summary: null, dateChosen: false };

    expect(
      issues(draft, NOW)
        .filter((issue) => issue.level === "required")
        .map((issue) => issue.step)
    ).toStrictEqual(["datos", "datos", "fecha"]);
    expect(stepState("datos", issues(draft, NOW))).toBe("required");
    expect(stepState("tipo", issues(draft, NOW))).toBe("done");
  });

  test("online events need their link; a place to be confirmed is only a suggestion", () => {
    const online = issues({ ...ready, mode: "online", venueId: null }, NOW);
    const somewhere = issues({ ...ready, venueId: null }, NOW);

    expect(online).toContainEqual({ step: "espacio", text: "Poné el link de la transmisión", level: "required" });
    expect(stepState("espacio", somewhere)).toBe("recommended");
  });

  test("an external sign-up needs its link, and a past date can't be published", () => {
    const list = issues({ ...ready, registration: "external", startDate: "2029-10-01T22:00:00.000Z" }, NOW);

    expect(list.map((issue) => issue.text)).toStrictEqual(["La fecha ya pasó", "Poné el link de inscripción"]);
  });

  test("code-of-conduct responders: two are required past 60 lugares, one is recommended below", () => {
    const required = (capacity: number | null, responders: string[]) =>
      issues({ ...ready, capacity, responders }, NOW)
        .filter((issue) => issue.text.includes("conducta"))
        .map((issue) => issue.level);

    expect([
      required(61, ["ana"]),
      required(61, ["ana", "beto"]),
      required(60, []),
      required(60, ["ana"]),
      required(null, []),
    ]).toStrictEqual([["required"], [], ["recommended"], [], ["recommended"]]);
    expect(stepState("inscripcion", issues({ ...ready, capacity: 120, responders: [] }, NOW))).toBe("required");
  });
});
