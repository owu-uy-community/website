import type { TimelineEvent, TimelineKind, TimelinePhoto } from "./types";

/** Shared by the server pages and the archive's client filters */

/** "Foto: Ana Pérez · Meetup": who took it and where it's published */
export const photoCredit = (photo: TimelinePhoto) =>
  photo.by ? `Foto: ${photo.by}${photo.source && photo.source !== photo.by ? ` · ${photo.source}` : ""}` : photo.source;

export const KIND_LABEL: Record<TimelineKind, string> = {
  meetup: "Meetup",
  conferencia: "Conferencia",
  hackaton: "Hackatón",
  taller: "Taller",
  jam: "Game jam",
  hito: "Hito",
};

export const STATUS_LABEL = { activa: "Activa", "en-pausa": "En pausa", cerrada: "Ya no se junta" } as const;

/** Someone's place in a group's team on Meetup, before the group's name: "Co-organiza Montevideo JS" */
export const ROLE_LABEL = {
  organizer: "Organiza",
  coorganizer: "Co-organiza",
  assistant: "Ayuda a organizar",
  events: "Organiza eventos de",
} as const;

/** "2014–2024", or one year */
export const yearSpan = (first?: string, last?: string) => {
  const from = first?.slice(0, 4);
  const to = last?.slice(0, 4);
  return !from ? "" : !to || from === to ? from : `${from}–${to}`;
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * "9 feb 2012", "14–15 mar 2014", "abr 2014" or "2010": as precise as the source. Reads the
 * date off the string (it carries the Montevideo offset already), never through a Date.
 */
export function formatDate(event: Pick<TimelineEvent, "start" | "end">, long = false) {
  const months = long ? MONTHS_LONG : MONTHS;
  const [year, month, day] = event.start.slice(0, 10).split("-");
  if (!month) return year;
  const name = months[Number(month) - 1];
  if (!day) return long ? `${name} de ${year}` : `${name} ${year}`;

  const [endYear, endMonth, endDay] = event.end?.slice(0, 10).split("-") ?? [];
  const sameMonth = endYear === year && endMonth === month;
  const range = endDay && endDay !== day ? (sameMonth ? `${Number(day)}–${Number(endDay)}` : null) : null;
  if (long) return `${range ?? Number(day)} de ${name} de ${year}`;
  return `${range ?? Number(day)} ${name} ${year}`;
}

/** "19:00" when the source has a time */
export const formatTime = (start: string) => (start.length > 10 ? start.slice(11, 16) : null);

// Combining accents (U+0300–U+036F), built from char codes so the formatter can't inline them invisibly
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/** Plain-text search: accent and case insensitive */
/** A Markdown description as plain text: for meta tags, structured data and search */
export const plainText = (markdown: string) =>
  markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|\W)[*_]([^*_\s][^*_]*?)[*_](?=\W|$)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
