// "Importar planilla": the team plans the day in a spreadsheet; these turn rows pasted from it
// into tasks. Pure, so the preview and the real import read a paste exactly the same way.
import type { ImportRow, StaffTask } from "./schemas";

type Person = ImportRow["people"][number];
export type SheetRow = Omit<ImportRow, "duplicate">;

type Column = "title" | "type" | "day" | "start" | "end" | "minPeople" | "location" | "people" | "notes";

/** How each column may be titled in the sheet (lowercase, no accents or punctuation). */
const COLUMN_NAMES: Record<Column, string[]> = {
  title: ["tarea", "tareas", "titulo", "actividad", "que"],
  type: ["tipo"],
  day: ["dia", "fecha"],
  start: ["inicio", "desde", "hora", "hora inicio", "hora de inicio", "empieza"],
  end: ["fin", "hasta", "hora fin", "hora de fin", "termina", "final"],
  minPeople: ["min", "minimo", "min personas", "minimo personas", "minimo de personas", "cupo"],
  location: ["lugar", "donde", "sala", "ubicacion", "zona"],
  people: ["personas", "asignados", "asignadas", "quien", "quienes", "staff", "responsables", "voluntarios", "equipo"],
  notes: ["notas", "nota", "instrucciones", "detalle", "detalles", "observaciones", "comentarios"],
};
/** Without a header row, the columns are read in this order. */
const DEFAULT_ORDER: Column[] = ["title", "type", "day", "start", "end", "minPeople", "location", "people", "notes"];

const TYPES = new Map<string, StaffTask["type"]>([
  ["", "task"],
  ["tarea", "task"],
  ["turno", "task"],
  ["task", "task"],
  ["continua", "ongoing"],
  ["continuo", "ongoing"],
  ["todo el dia", "ongoing"],
  ["ongoing", "ongoing"],
  ["hito", "milestone"],
  ["agenda", "milestone"],
  ["momento", "milestone"],
  ["milestone", "milestone"],
]);

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Lowercase, no accents, punctuation as single spaces: "¿Mín. personas?" → "min personas". */
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Rows of cells from pasted spreadsheet text: tab-separated when the first line has a tab (a
 * copy from Google Sheets), else comma-separated (a CSV). A "quoted" cell may hold the
 * separator, line breaks or doubled "" quotes, as both write them. Blank rows are dropped.
 */
export function splitCells(text: string): { line: number; cells: string[] }[] {
  const separator = (text.split(/\r?\n/, 1)[0] ?? "").includes("\t") ? "\t" : ",";
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      rows.push({ line: rowLine, cells: [...cells, cell] });
      cells = [];
      cell = "";
      line += 1;
      rowLine = line;
    } else {
      cell += char;
    }
  }
  rows.push({ line: rowLine, cells: [...cells, cell] });

  return rows.filter((row) => row.cells.some((value) => value.trim() !== ""));
}

const columnOf = (header: string): Column | null => {
  const name = normalize(header);
  return (Object.keys(COLUMN_NAMES) as Column[]).find((column) => COLUMN_NAMES[column].includes(name)) ?? null;
};

/** "14", "14:30", "14.30", "14h30", "14:30:00" → "14:30". */
const parseTime = (raw: string): string | null => {
  const match = /^(\d{1,2})(?:[:.h](\d{2}))?(?::\d{2})?\s*(?:h|hs)?$/i.exec(raw);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);

  return hours < 24 && minutes < 60 ? `${pad(hours)}:${pad(minutes)}` : null;
};

/** "2026-11-07", "7/11/2026", "7/11", "sáb 7 nov", "7 de noviembre de 2026" → "2026-11-07". */
const parseDay = (raw: string, year: number): string | null => {
  const text = normalize(raw);
  let parts: [number, number, number] | null = null;
  const iso = /^(\d{4}) (\d{1,2}) (\d{1,2})$/.exec(text);
  const numeric = /^(\d{1,2}) (\d{1,2})(?: (\d{2}|\d{4}))?$/.exec(text);
  const named = /^(?:[a-z]+ )?(\d{1,2}) (?:de )?([a-z]+)(?: (?:de )?(\d{4}))?$/.exec(text);
  if (iso) {
    parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (numeric) {
    const given = numeric[3] ? Number(numeric[3]) : year;
    parts = [given < 100 ? 2000 + given : given, Number(numeric[2]), Number(numeric[1])];
  } else if (named) {
    // Uruguay writes "setiembre".
    const month = named[2].startsWith("set") ? 9 : MONTHS.findIndex((prefix) => named[2].startsWith(prefix)) + 1;
    if (month > 0) parts = [named[3] ? Number(named[3]) : year, month, Number(named[1])];
  }
  if (!parts) return null;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));

  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.toISOString().slice(0, 10)
    : null;
};

/** One roster person for a name as people write it: "Juan Oliú", "Oliú", "Vale". */
const findPerson = (written: string, roster: readonly Person[]): Person | string => {
  const wanted = normalize(written);
  const words = (person: Person) => normalize(person.name).split(" ");
  const exact = roster.filter((person) => normalize(person.name) === wanted);
  if (exact.length === 1) return exact[0];
  const matches = roster.filter(
    (person) => normalize(person.name).startsWith(wanted) || words(person).some((word) => word.startsWith(wanted))
  );
  if (matches.length === 1) return matches[0];
  const byFirstName = matches.filter((person) => words(person)[0] === wanted);
  if (byFirstName.length === 1) return byFirstName[0];
  if (matches.length === 0) return `No encontramos a «${written}» en el staff`;
  const names = matches.slice(0, 3).map((person) => person.name);

  return `«${written}» puede ser ${names.slice(0, -1).join(", ")} o ${names.at(-1)}`;
};

function parseRow(
  line: number,
  cell: (column: Column) => string,
  roster: readonly Person[],
  defaultDay: string
): SheetRow {
  const errors: string[] = [];
  const optional = <T>(column: Column, parse: (raw: string) => T | null, error: (raw: string) => string) => {
    const raw = cell(column);
    if (!raw) return null;
    const value = parse(raw);
    if (value === null) errors.push(error(raw));
    return value;
  };

  const title = cell("title");
  if (!title) errors.push("Falta el nombre de la tarea");
  if (title.length > 200) errors.push("El nombre es muy largo (hasta 200 caracteres)");
  const type = TYPES.get(normalize(cell("type")));
  if (!type) errors.push(`Tipo «${cell("type")}»: usá tarea, continua o hito`);
  const dayDate = cell("day")
    ? optional(
        "day",
        (raw) => parseDay(raw, Number(defaultDay.slice(0, 4))),
        (raw) => `Día «${raw}»: usá 7/11/2026`
      )
    : defaultDay;
  const startTime = optional("start", parseTime, (raw) => `Inicio «${raw}»: usá 14:30`);
  const endTime = optional("end", parseTime, (raw) => `Fin «${raw}»: usá 14:30`);
  const minPeople = optional(
    "minPeople",
    (raw) => (/^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 99 ? Number(raw) : null),
    (raw) => `Mín «${raw}»: un número del 1 al 99`
  );
  const location = cell("location") || null;
  if (location && location.length > 120) errors.push("El lugar es muy largo (hasta 120 caracteres)");
  const notes = cell("notes") || null;
  if (notes && notes.length > 4000) errors.push("Las notas son muy largas (hasta 4000 caracteres)");

  const people: Person[] = [];
  for (const written of cell("people").split(/\s*(?:[,;\n/+]|\sy\s)\s*/)) {
    if (!written.trim()) continue;
    const found = findPerson(written.trim(), roster);
    if (typeof found === "string") errors.push(found);
    else if (!people.some((person) => person.userId === found.userId)) people.push(found);
  }

  if (endTime && !startTime) errors.push("Tiene fin pero no inicio");
  if (startTime && endTime && endTime <= startTime) errors.push(`Termina antes de empezar (${startTime}–${endTime})`);
  if (type === "milestone" && (endTime || minPeople || people.length > 0)) {
    errors.push("Un hito es solo un momento: va sin fin, sin mínimo y sin personas");
  }

  return {
    line,
    title,
    type: type ?? "task",
    dayDate,
    startTime,
    endTime,
    minPeople,
    location,
    notes,
    people,
    errors,
  };
}

/**
 * Tasks from rows pasted from a spreadsheet. A first row naming at least two known columns is
 * the header (any order, any of the usual names); without one, columns are read as
 * Tarea · Tipo · Día · Inicio · Fin · Mín · Lugar · Personas · Notas. People are matched by name
 * against the roster. Every row comes back, with what is wrong with it in `errors`.
 */
export function parseSheet(
  text: string,
  { roster, defaultDay }: { roster: readonly Person[]; defaultDay: string }
): SheetRow[] {
  const rows = splitCells(text);
  if (rows.length === 0) return [];
  const header = rows[0].cells.map(columnOf);
  const hasHeader = header.filter(Boolean).length >= 2;
  const columns: (Column | null)[] = hasHeader ? header : DEFAULT_ORDER;

  return (hasHeader ? rows.slice(1) : rows).map(({ line, cells }) =>
    parseRow(
      line,
      (column) => {
        const index = columns.indexOf(column);
        return index >= 0 ? (cells[index] ?? "").trim() : "";
      },
      roster,
      defaultDay
    )
  );
}

/** Same day, start and title (ignoring case and accents): the same task. */
export const taskKey = (task: { dayDate: string | null; startTime: string | null; title: string }) =>
  `${task.dayDate}|${task.startTime ?? ""}|${normalize(task.title)}`;
