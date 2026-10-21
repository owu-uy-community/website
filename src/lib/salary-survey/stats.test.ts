import { describe, expect, test } from "vitest";

import { breakdown, datasetCsv, summarize, type ResponseFacts } from "./stats";
import { SENIORITIES } from "./questions";

const answer = (overrides: Partial<ResponseFacts> = {}): ResponseFacts => ({
  role: "backend",
  seniority: "senior",
  experience: "5-10",
  stacks: ["js-ts"],
  employer: "empresa-uy",
  contract: "dependencia",
  modality: "remoto",
  department: "montevideo",
  currency: "UYU",
  amount: 100_000,
  hoursPerWeek: 40,
  gender: null,
  education: null,
  ...overrides,
});

describe(summarize, () => {
  test("reports interpolated quartiles", () => {
    expect(summarize([10, 20, 30, 40, 50], 1)).toStrictEqual({ n: 5, p25: 20, median: 30, p75: 40 });
    expect(summarize([10, 20, 30, 40], 1)).toStrictEqual({ n: 4, p25: 18, median: 25, p75: 33 });
  });

  test("hides groups under the threshold", () => {
    expect(summarize(Array.from({ length: 9 }, () => 1))).toBeNull();
    expect(summarize(Array.from({ length: 10 }, () => 1))).toMatchObject({ n: 10 });
  });
});

describe(breakdown, () => {
  test("keeps catalog order and counts suppressed groups", () => {
    const rows = [
      ...Array.from({ length: 12 }, () => answer({ seniority: "senior" })),
      ...Array.from({ length: 10 }, () => answer({ seniority: "junior", amount: 50_000 })),
      ...Array.from({ length: 3 }, () => answer({ seniority: "lead" })),
    ];
    const result = breakdown(rows, (row) => [row.seniority], SENIORITIES);

    expect(result.groups.map((group) => group.key)).toStrictEqual(["junior", "senior"]);
    expect(result.hidden).toBe(1);
  });
});

describe(datasetCsv, () => {
  const rows = [
    ...Array.from({ length: 10 }, () => answer({ amount: 101_499 })),
    answer({ role: "seguridad", department: "rocha", gender: "mujer", amount: 87_600 }),
  ];
  const [header, first, ...rest] = datasetCsv(rows).trim().split("\n");
  const last = rest.at(-1) ?? "";

  test("rounds amounts and keeps the documented columns", () => {
    expect(header.split(",")).toContain("monto_mensual");
    expect(first).toContain(",101000,");
  });

  test("collapses categories rarer than the threshold", () => {
    expect(last.startsWith("otro,")).toBe(true);
    // A lone answer from the interior isn't even shown as "interior"
    expect(last).not.toContain("interior");
    expect(last).not.toContain("rocha");
    expect(last).not.toContain("mujer");
  });
});
