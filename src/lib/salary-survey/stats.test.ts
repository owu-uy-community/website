import { describe, expect, test } from "vitest";

import {
  breakdown,
  datasetCsv,
  percentileOf,
  profile,
  satisfactionStats,
  summarize,
  type ResponseFacts,
} from "./stats";
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
  satisfaction: 4,
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

describe(percentileOf, () => {
  test("places a value among the answers, ties counted half", () => {
    expect(percentileOf([10, 20, 30, 40], 25)).toBe(50);
    expect(percentileOf([10, 20, 30, 40], 20)).toBe(38);
    expect(percentileOf([10, 20, 30, 40], 5)).toBe(0);
    expect(percentileOf([], 5)).toBeNull();
  });
});

describe(profile, () => {
  test("lists groups at or above the threshold and sums the rest into other", () => {
    const rows = [
      ...Array.from({ length: 10 }, () => answer({ gender: "varon" })),
      ...Array.from({ length: 2 }, () => answer({ seniority: "junior", gender: "mujer" })),
      answer({ gender: null }),
    ];
    const byGender = profile(rows).find((dimension) => dimension.key === "gender")!;
    const bySeniority = profile(rows).find((dimension) => dimension.key === "seniority")!;

    expect(byGender).toMatchObject({ answered: 12, groups: [{ key: "varon", n: 10 }], other: 2 });
    expect(bySeniority).toMatchObject({ answered: 13, groups: [{ key: "senior", n: 11 }], other: 2 });
  });
});

describe(satisfactionStats, () => {
  test("averages the scale and keeps only groups above the threshold", () => {
    const rows = [
      ...Array.from({ length: 10 }, () => answer({ satisfaction: 5 })),
      ...Array.from({ length: 10 }, () => answer({ satisfaction: 2, employer: "cliente-exterior" })),
      answer({ seniority: "junior", satisfaction: 1 }),
      answer({ satisfaction: null }),
    ];
    const stats = satisfactionStats(rows)!;

    expect(stats).toMatchObject({ n: 21, mean: 3.4, distribution: [1, 10, 0, 0, 10] });
    expect(stats.bySeniority).toStrictEqual([{ key: "senior", label: "Senior", n: 20, mean: 3.5 }]);
    expect(stats.byMarket.map((group) => [group.key, group.mean])).toStrictEqual([
      ["exterior", 2],
      ["local", 4.6],
    ]);
  });

  test("is null until enough people answered", () => {
    expect(satisfactionStats(Array.from({ length: 9 }, () => answer()))).toBeNull();
  });
});
