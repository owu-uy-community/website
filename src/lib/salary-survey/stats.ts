import type { Breakdown, CurrencyResults, Stat } from "lib/orpc/salary-survey/schemas";

import {
  CONTRACTS,
  EDUCATION,
  EMPLOYERS,
  EXPERIENCE,
  GENDERS,
  MARKETS,
  marketOf,
  MIN_GROUP_SIZE,
  MODALITIES,
  ROLES,
  SENIORITIES,
  STACKS,
} from "./questions";

/** What the results and the dataset read from each answer */
export type ResponseFacts = {
  role: string;
  seniority: string;
  experience: string;
  stacks: string[];
  employer: string;
  contract: string;
  modality: string;
  department: string;
  currency: string;
  amount: number;
  hoursPerWeek: number;
  gender: string | null;
  education: string | null;
};

type Option = { readonly value: string; readonly label: string };

/** Linear-interpolated quantile of a sorted list (the spreadsheet's PERCENTILE.INC) */
function quantile(sorted: number[], q: number) {
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.ceil(position);

  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

/** Quartiles of a group, or null when the group is too small to show */
export function summarize(amounts: number[], threshold = MIN_GROUP_SIZE): Stat | null {
  if (amounts.length < threshold) return null;
  const sorted = [...amounts].sort((a, b) => a - b);

  return {
    n: sorted.length,
    p25: Math.round(quantile(sorted, 0.25)),
    median: Math.round(quantile(sorted, 0.5)),
    p75: Math.round(quantile(sorted, 0.75)),
  };
}

/** Quartiles per category, in the catalog's order; small groups are counted but not shown */
export function breakdown(
  rows: ResponseFacts[],
  keysOf: (row: ResponseFacts) => string[],
  catalog: readonly Option[],
  threshold = MIN_GROUP_SIZE
): Breakdown {
  const amounts = new Map<string, number[]>();
  for (const row of rows) {
    for (const key of keysOf(row)) amounts.set(key, [...(amounts.get(key) ?? []), row.amount]);
  }

  const groups: Breakdown["groups"] = [];
  let hidden = 0;
  for (const { value, label } of catalog) {
    const list = amounts.get(value);
    if (!list) continue;
    const stat = summarize(list, threshold);
    if (stat) groups.push({ key: value, label, stat });
    else hidden += 1;
  }

  return { groups, hidden };
}

/** Everything the results page shows for one currency */
export function currencyResults(rows: ResponseFacts[], threshold = MIN_GROUP_SIZE): CurrencyResults {
  return {
    n: rows.length,
    overall: summarize(
      rows.map((row) => row.amount),
      threshold
    ),
    bySeniority: breakdown(rows, (row) => [row.seniority], SENIORITIES, threshold),
    byRole: breakdown(rows, (row) => [row.role], ROLES, threshold),
    byStack: breakdown(rows, (row) => row.stacks, STACKS, threshold),
    byContract: breakdown(rows, (row) => [row.contract], CONTRACTS, threshold),
    byMarket: breakdown(rows, (row) => [marketOf(row.employer)], MARKETS, threshold),
  };
}

// ---------------------------------------------------------------------------
// Open dataset
// ---------------------------------------------------------------------------

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

const hoursBucket = (hours: number) => (hours < 30 ? "menos-30" : hours < 40 ? "30-39" : hours < 45 ? "40-44" : "45-o-mas");

const csvCell = (value: string | number) => {
  const text = String(value);

  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const DATASET_COLUMNS = [
  "rol",
  "seniority",
  "experiencia",
  "stacks",
  "para_quien",
  "mercado",
  "contratacion",
  "modalidad",
  "region",
  "moneda",
  "monto_mensual",
  "horas_semanales",
  "genero",
  "educacion",
] as const;

/**
 * One row per answer, coarsened so no row stands out: categories with fewer
 * answers than the threshold become "otro", the department becomes Montevideo
 * or interior, amounts are rounded and hours bucketed. No free text exists.
 * ponytail: per-column suppression, not full k-anonymity on combinations; move
 * to combination checks if the dataset ever gets more columns.
 */
export function datasetCsv(rows: ResponseFacts[], threshold = MIN_GROUP_SIZE): string {
  const counts = new Map<string, number>();
  const count = (column: string, value: string) => counts.set(`${column}:${value}`, (counts.get(`${column}:${value}`) ?? 0) + 1);
  const coarse = (column: string, value: string) => ((counts.get(`${column}:${value}`) ?? 0) >= threshold ? value : "otro");

  const shaped = rows.map((row) => ({
    rol: row.role,
    seniority: row.seniority,
    experiencia: row.experience,
    stacks: row.stacks,
    para_quien: row.employer,
    mercado: marketOf(row.employer),
    contratacion: row.contract,
    modalidad: row.modality,
    region: row.department === "montevideo" ? "montevideo" : "interior",
    moneda: row.currency,
    monto_mensual: roundTo(row.amount, row.currency === "USD" ? 50 : 1000),
    horas_semanales: hoursBucket(row.hoursPerWeek),
    genero: row.gender ?? "sin-dato",
    educacion: row.education ?? "sin-dato",
  }));

  const categorical = ["rol", "seniority", "experiencia", "para_quien", "contratacion", "modalidad", "region", "genero", "educacion"] as const;
  for (const row of shaped) {
    for (const column of categorical) count(column, row[column]);
    for (const stack of row.stacks) count("stacks", stack);
  }

  const lines = shaped.map((row) =>
    DATASET_COLUMNS.map((column) => {
      if (column === "stacks") return csvCell([...new Set(row.stacks.map((stack) => coarse("stacks", stack)))].join(";"));
      if ((categorical as readonly string[]).includes(column)) return csvCell(coarse(column, row[column as (typeof categorical)[number]]));

      return csvCell(row[column]);
    }).join(",")
  );

  return [DATASET_COLUMNS.join(","), ...lines].join("\n") + "\n";
}

/** The data dictionary shown next to the download */
export const DATASET_DICTIONARY: { column: (typeof DATASET_COLUMNS)[number]; description: string; options?: readonly Option[] }[] = [
  { column: "rol", description: "Rol principal", options: ROLES },
  { column: "seniority", description: "Seniority declarado", options: SENIORITIES },
  { column: "experiencia", description: "Años de experiencia, en rangos", options: EXPERIENCE },
  { column: "stacks", description: "Hasta tres stacks, separados por punto y coma", options: STACKS },
  { column: "para_quien", description: "Para quién trabaja", options: EMPLOYERS },
  { column: "mercado", description: "exterior si trabaja para afuera, local si no", options: MARKETS },
  { column: "contratacion", description: "Forma de contratación", options: CONTRACTS },
  { column: "modalidad", description: "Remoto, híbrido o presencial", options: MODALITIES },
  { column: "region", description: "montevideo o interior" },
  { column: "moneda", description: "UYU o USD: los montos no se convierten" },
  { column: "monto_mensual", description: "Nominal mensual (sueldo o facturación), redondeado a 1.000 UYU o 50 USD" },
  { column: "horas_semanales", description: "Horas por semana, en rangos" },
  { column: "genero", description: "Opcional; sin-dato si no respondió", options: GENDERS },
  { column: "educacion", description: "Opcional; sin-dato si no respondió", options: EDUCATION },
];
