"use client";

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";

import type { ArchiveRow } from "lib/timeline/data";
import { normalize } from "lib/timeline/format";
import type { TimelineKind } from "lib/timeline/types";

import type { ArchiveCommunity } from "./archive-data";

export const KINDS: TimelineKind[] = ["meetup", "conferencia", "hackaton", "taller", "jam", "hito"];
export const SORTS = ["antiguos", "recientes", "concurridos", "fotos"] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = {
  antiguos: "Del más antiguo al más nuevo",
  recientes: "Del más nuevo al más antiguo",
  concurridos: "Los más concurridos",
  fotos: "Los que tienen más fotos",
};

/** The archive's whole state lives in the URL: a filtered view is a link anyone can open */
const parsers = {
  q: parseAsString.withDefault(""),
  // An array, but one community still reads as ?comunidad=ruby-montevideo (the links the site already has)
  comunidad: parseAsArrayOf(parseAsString).withDefault([]),
  tipo: parseAsArrayOf(parseAsStringLiteral(KINDS)).withDefault([]),
  tema: parseAsString.withDefault(""),
  ciudad: parseAsString.withDefault(""),
  desde: parseAsInteger,
  hasta: parseAsInteger,
  fotos: parseAsBoolean.withDefault(false),
  online: parseAsBoolean.withDefault(false),
  ecosistema: parseAsBoolean.withDefault(false),
  orden: parseAsStringLiteral(SORTS).withDefault("antiguos"),
  evento: parseAsString.withDefault(""),
};

export function useArchiveFilters() {
  return useQueryStates(parsers, { history: "replace", scroll: false });
}

export type ArchiveFilters = ReturnType<typeof useArchiveFilters>[0];
export type SetArchiveFilters = ReturnType<typeof useArchiveFilters>[1];

/** Everything but the selected event and the order: what decides which rows show */
export const CLEARED = {
  q: null,
  comunidad: null,
  tipo: null,
  tema: null,
  ciudad: null,
  desde: null,
  hasta: null,
  fotos: null,
  online: null,
  ecosistema: null,
} as const;

export const activeCount = (state: ArchiveFilters) =>
  (state.q ? 1 : 0) +
  state.comunidad.length +
  state.tipo.length +
  (state.tema ? 1 : 0) +
  (state.ciudad ? 1 : 0) +
  (state.desde !== null || state.hasta !== null ? 1 : 0) +
  (state.fotos ? 1 : 0) +
  (state.online ? 1 : 0) +
  (state.ecosistema ? 1 : 0);

export function filterRows(rows: ArchiveRow[], state: ArchiveFilters, communities: Map<string, ArchiveCommunity>) {
  const term = normalize(state.q.trim());
  const chosen = new Set(state.comunidad);
  const kinds = new Set(state.tipo);

  return rows.filter((row) => {
    if (chosen.size && !chosen.has(row.c)) return false;
    if (kinds.size && !kinds.has(row.k)) return false;
    // Chosen communities show all of their events, whatever layer they sit in
    if (!state.ecosistema && row.x && !chosen.size) return false;
    if (!state.online && row.o) return false;
    if (state.fotos && !row.n) return false;
    if (state.tema && communities.get(row.c)?.topic !== state.tema) return false;
    if (state.ciudad && row.y !== state.ciudad) return false;
    const year = Number(row.d.slice(0, 4));
    if (state.desde !== null && year < state.desde) return false;
    if (state.hasta !== null && year > state.hasta) return false;
    if (!term) return true;
    return normalize(`${row.t} ${communities.get(row.c)?.name ?? ""} ${row.v ?? ""}`).includes(term);
  });
}

export function sortRows(rows: ArchiveRow[], sort: Sort) {
  if (sort === "recientes") return rows.toReversed();
  if (sort === "concurridos") return rows.filter((row) => row.r).toSorted((a, b) => (b.r ?? 0) - (a.r ?? 0));
  if (sort === "fotos") return rows.filter((row) => row.n).toSorted((a, b) => (b.n ?? 0) - (a.n ?? 0));
  return rows;
}

/** Cities with at least a few events, busiest first */
export function cityOptions(rows: ArchiveRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.y) counts.set(row.y, (counts.get(row.y) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count >= 3)
    .toSorted((a, b) => b[1] - a[1])
    .map(([city, count]) => ({ city, count }));
}
