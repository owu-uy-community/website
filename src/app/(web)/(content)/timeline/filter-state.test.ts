import { describe, expect, test } from "vitest";

import type { ArchiveRow } from "lib/timeline/data";

import type { ArchiveCommunity } from "./archive-data";
import { type ArchiveFilters, filterRows } from "./filter-state";

const state = (q: string): ArchiveFilters => ({
  q,
  comunidad: [],
  tipo: [],
  tema: "",
  ciudad: "",
  desde: null,
  hasta: null,
  fotos: false,
  online: false,
  ecosistema: false,
  orden: "antiguos",
  evento: "",
});

const row = (t: string, c: string) => ({ s: t, t, d: "2014-05-17", c, k: "conferencia" }) as ArchiveRow;
const rows = [row("Agile Open Space UY 2014", "agile-open-space-uy"), row("10mo Meetup", "agileuy")];
const communities = new Map([
  ["agile-open-space-uy", { name: "Agile Open Space UY" }],
  ["agileuy", { name: "AgileUY" }],
]) as unknown as Map<string, ArchiveCommunity>;
const titles = (q: string) => filterRows(rows, state(q), communities).map(({ t }) => t);

describe(filterRows, () => {
  test("the search ignores spaces, the way people write names", () => {
    expect(titles("openspace")).toStrictEqual(["Agile Open Space UY 2014"]);
    expect(titles("Ágile UY")).toStrictEqual(["10mo Meetup"]);
    expect(titles("open space")).toStrictEqual(["Agile Open Space UY 2014"]);
  });
});
