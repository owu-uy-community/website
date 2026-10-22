import type {
  Breakdown,
  CurrencyResults,
  DatasetRow,
  ProfileDimension,
  Satisfaction,
  Stat,
} from "lib/orpc/salary-survey/schemas";

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

/*
 * Pure arithmetic over answers: quartiles, breakdowns, the respondents' profile,
 * the satisfaction scale and the open dataset. No server imports, so the
 * explorer on the results page runs the same code in the browser over the
 * published dataset and gets the same numbers.
 */

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
  satisfaction: number | null;
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

/** Where a value falls in a group, 0–100: the share of answers at or below it */
export function percentileOf(amounts: number[], value: number) {
  if (amounts.length === 0) return null;
  const below = amounts.filter((amount) => amount < value).length;
  const equal = amounts.filter((amount) => amount === value).length;

  return Math.round(((below + equal / 2) / amounts.length) * 100);
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
    byExperience: breakdown(rows, (row) => [row.experience], EXPERIENCE, threshold),
    byRole: breakdown(rows, (row) => [row.role], ROLES, threshold),
    byStack: breakdown(rows, (row) => row.stacks, STACKS, threshold),
    byModality: breakdown(rows, (row) => [row.modality], MODALITIES, threshold),
    byContract: breakdown(rows, (row) => [row.contract], CONTRACTS, threshold),
    byMarket: breakdown(rows, (row) => [marketOf(row.employer)], MARKETS, threshold),
  };
}

// ---------------------------------------------------------------------------
// Who answered
// ---------------------------------------------------------------------------

const REGIONS: readonly Option[] = [
  { value: "montevideo", label: "Montevideo" },
  { value: "interior", label: "Interior" },
];

const regionOf = (department: string) => (department === "montevideo" ? "montevideo" : "interior");

/** Counts per option of one question; options under the threshold are summed into `other`, never listed */
function dimension(
  key: string,
  label: string,
  rows: ResponseFacts[],
  valueOf: (row: ResponseFacts) => string | null,
  catalog: readonly Option[],
  threshold: number
): ProfileDimension {
  const counts = new Map<string, number>();
  let answered = 0;
  for (const row of rows) {
    const value = valueOf(row);
    if (value == null) continue;
    answered += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const groups: ProfileDimension["groups"] = [];
  let other = 0;
  for (const option of catalog) {
    const n = counts.get(option.value) ?? 0;
    if (n === 0) continue;
    if (n >= threshold) groups.push({ key: option.value, label: option.label, n });
    else other += n;
  }

  return { key, label, answered, groups, other };
}

/** The respondents' profile: one dimension per closed question (the optional ones count only who answered) */
export function profile(rows: ResponseFacts[], threshold = MIN_GROUP_SIZE): ProfileDimension[] {
  return [
    dimension("seniority", "Seniority", rows, (row) => row.seniority, SENIORITIES, threshold),
    dimension("role", "Rol", rows, (row) => row.role, ROLES, threshold),
    dimension("experience", "Años de experiencia", rows, (row) => row.experience, EXPERIENCE, threshold),
    dimension("market", "Para quién", rows, (row) => marketOf(row.employer), MARKETS, threshold),
    dimension("employer", "Tipo de empleador", rows, (row) => row.employer, EMPLOYERS, threshold),
    dimension("modality", "Modalidad", rows, (row) => row.modality, MODALITIES, threshold),
    dimension("contract", "Contratación", rows, (row) => row.contract, CONTRACTS, threshold),
    dimension("region", "Dónde vive", rows, (row) => regionOf(row.department), REGIONS, threshold),
    dimension("gender", "Género", rows, (row) => row.gender, GENDERS, threshold),
    dimension("education", "Nivel educativo", rows, (row) => row.education, EDUCATION, threshold),
  ];
}

// ---------------------------------------------------------------------------
// How people feel about their pay
// ---------------------------------------------------------------------------

const round1 = (value: number) => Math.round(value * 10) / 10;

function meanGroups(
  rows: ResponseFacts[],
  keyOf: (row: ResponseFacts) => string,
  catalog: readonly Option[],
  threshold: number
) {
  const values = new Map<string, number[]>();
  for (const row of rows) {
    if (row.satisfaction == null) continue;
    const key = keyOf(row);
    values.set(key, [...(values.get(key) ?? []), row.satisfaction]);
  }

  return catalog.flatMap(({ value, label }) => {
    const list = values.get(value);
    if (!list || list.length < threshold) return [];

    return [{ key: value, label, n: list.length, mean: round1(list.reduce((sum, v) => sum + v, 0) / list.length) }];
  });
}

/** The 1–5 satisfaction scale: average, distribution and averages per seniority and market; null under the threshold */
export function satisfactionStats(rows: ResponseFacts[], threshold = MIN_GROUP_SIZE): Satisfaction | null {
  const answered = rows.filter((row) => row.satisfaction != null);
  if (answered.length < threshold) return null;

  const distribution = [0, 0, 0, 0, 0];
  let total = 0;
  for (const row of answered) {
    const step = Math.min(5, Math.max(1, row.satisfaction!));
    distribution[step - 1] += 1;
    total += step;
  }

  return {
    n: answered.length,
    mean: round1(total / answered.length),
    distribution,
    bySeniority: meanGroups(answered, (row) => row.seniority, SENIORITIES, threshold),
    byMarket: meanGroups(answered, (row) => marketOf(row.employer), MARKETS, threshold),
  };
}

// ---------------------------------------------------------------------------
// Open dataset
// ---------------------------------------------------------------------------

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

const hoursBucket = (hours: number) =>
  hours < 30 ? "menos-30" : hours < 40 ? "30-39" : hours < 45 ? "40-44" : "45-o-mas";

export const DATASET_COLUMNS = [
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
  "conformidad",
  "genero",
  "educacion",
] as const;

const CATEGORICAL = [
  "rol",
  "seniority",
  "experiencia",
  "para_quien",
  "contratacion",
  "modalidad",
  "region",
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
export function datasetRows(rows: ResponseFacts[], threshold = MIN_GROUP_SIZE): DatasetRow[] {
  const counts = new Map<string, number>();
  const count = (column: string, value: string) =>
    counts.set(`${column}:${value}`, (counts.get(`${column}:${value}`) ?? 0) + 1);
  const coarse = (column: string, value: string) =>
    (counts.get(`${column}:${value}`) ?? 0) >= threshold ? value : "otro";

  const shaped: DatasetRow[] = rows.map((row) => ({
    rol: row.role,
    seniority: row.seniority,
    experiencia: row.experience,
    stacks: row.stacks,
    para_quien: row.employer,
    mercado: marketOf(row.employer),
    contratacion: row.contract,
    modalidad: row.modality,
    region: regionOf(row.department),
    moneda: row.currency,
    monto_mensual: roundTo(row.amount, row.currency === "USD" ? 50 : 1000),
    horas_semanales: hoursBucket(row.hoursPerWeek),
    conformidad: row.satisfaction,
    genero: row.gender ?? "sin-dato",
    educacion: row.education ?? "sin-dato",
  }));

  for (const row of shaped) {
    for (const column of CATEGORICAL) count(column, row[column]);
    for (const stack of row.stacks) count("stacks", stack);
  }

  return shaped.map((row) => ({
    ...row,
    ...Object.fromEntries(CATEGORICAL.map((column) => [column, coarse(column, row[column])])),
    stacks: [...new Set(row.stacks.map((stack) => coarse("stacks", stack)))],
  }));
}

const csvCell = (value: string | number | null) => {
  const text = value == null ? "" : String(value);

  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function datasetCsv(rows: ResponseFacts[], threshold = MIN_GROUP_SIZE): string {
  const lines = datasetRows(rows, threshold).map((row) =>
    DATASET_COLUMNS.map((column) => csvCell(column === "stacks" ? row.stacks.join(";") : row[column])).join(",")
  );

  return [DATASET_COLUMNS.join(","), ...lines].join("\n") + "\n";
}

/** The data dictionary shown next to the download */
export const DATASET_DICTIONARY: {
  column: (typeof DATASET_COLUMNS)[number];
  description: string;
  options?: readonly Option[];
}[] = [
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
  {
    column: "monto_mensual",
    description: "Nominal mensual (sueldo o facturación), redondeado a 1.000 UYU o 50 USD",
  },
  { column: "horas_semanales", description: "Horas por semana, en rangos" },
  { column: "conformidad", description: "Qué tan conforme con lo que cobra, de 1 (nada) a 5 (muy)" },
  { column: "genero", description: "Opcional; sin-dato si no respondió", options: GENDERS },
  { column: "educacion", description: "Opcional; sin-dato si no respondió", options: EDUCATION },
];
