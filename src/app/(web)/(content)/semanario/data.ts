import "server-only";

import { ORPCError } from "@orpc/server";
import { cache } from "react";

import { publicCaller } from "lib/orpc/server";
import type { SemanarioSummary } from "lib/orpc/semanario/schemas";
import { MONTEVIDEO_TZ } from "lib/community/time";

/** The reaction that nominates a Slack thread for the next issue (Owy reads OWY_SEMANARIO_EMOJI, same default). */
export const SEMANARIO_EMOJI = "semanario";

const isBuild = () => process.env.NEXT_PHASE === "phase-production-build";

/**
 * Published issues. A build without the table (schema not pushed yet) or
 * without the database renders the empty archive instead of failing the whole
 * site; at runtime an error throws, so a revalidation keeps the last good page.
 */
export const getIssues = cache(async (): Promise<SemanarioSummary[]> => {
  try {
    return await publicCaller.semanario.list();
  } catch (error) {
    if (isBuild()) return [];
    throw error;
  }
});

/** A published issue, or null when that number doesn't exist (or isn't published) */
export const getIssue = cache(async (number: number) => {
  try {
    return await publicCaller.semanario.get({ number });
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") return null;
    if (isBuild()) return null;
    throw error;
  }
});

const dayMonth = new Intl.DateTimeFormat("es-UY", { timeZone: MONTEVIDEO_TZ, day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("es-UY", {
  timeZone: MONTEVIDEO_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const clean = (value: string) => value.replace(/\./g, "").toLowerCase();

/** "19 al 25 oct 2026" or "26 oct al 1 nov 2026": the week that starts on `weekStart` (a Monday) */
export function weekRange(weekStart: string) {
  const monday = new Date(`${weekStart}T12:00:00Z`);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const from =
    monday.getUTCMonth() === sunday.getUTCMonth() ? String(monday.getUTCDate()) : clean(dayMonth.format(monday));

  return `${from} al ${clean(dayMonthYear.format(sunday))}`;
}

export const longDate = (iso: string) => clean(dayMonthYear.format(new Date(iso)));

/** The intro's first paragraph as plain text: card excerpts, meta descriptions, RSS */
export function excerpt(markdown: string, max = 220) {
  const text = (markdown.split(/\n\s*\n/)[0] ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
