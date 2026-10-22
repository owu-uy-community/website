/** The wizard's steps, in order, and what each still needs. Shared by the panel and `events.publish`. */
export const STEPS = [
  { key: "tipo", title: "Tipo" },
  { key: "datos", title: "Datos" },
  { key: "fecha", title: "Fecha" },
  { key: "espacio", title: "Lugar" },
  { key: "inscripcion", title: "Inscripción" },
  { key: "difusion", title: "Difusión" },
  { key: "revisar", title: "Revisar" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export const isStep = (value: string | null | undefined): value is StepKey => STEPS.some((step) => step.key === value);

/** The fields the checks read: an event as the organizer edits it. */
export type Checkable = {
  name: string;
  summary: string | null;
  description: string | null;
  format: string | null;
  topics: string[];
  dateChosen: boolean;
  startDate: string;
  mode: "presencial" | "online" | "hibrido";
  venueId: string | null;
  placeName: string | null;
  onlineUrl: string | null;
  registration: "none" | "owu" | "external" | "eventbrite";
  registrationUrl: string | null;
  capacity: number | null;
};

export type Issue = { step: StepKey; text: string; level: "required" | "recommended" };

/** The name a draft starts with: not a name yet. */
export const UNTITLED = "Evento sin título";

/** What's missing before publishing (required) and what would make it better (recommended). */
export function issues(event: Checkable, now = Date.now()): Issue[] {
  const list: Issue[] = [];
  const need = (step: StepKey, text: string) => list.push({ step, text, level: "required" });
  const could = (step: StepKey, text: string) => list.push({ step, text, level: "recommended" });
  const inPerson = event.mode !== "online";

  if (!event.format) could("tipo", "Elegí el formato");

  if (event.name.trim().length < 3 || event.name.trim() === UNTITLED) need("datos", "Ponele un nombre");
  if (!event.summary?.trim()) need("datos", "Escribí una línea que lo resuma");
  if (!event.description?.trim()) could("datos", "Contá de qué se trata");
  if (event.topics.length === 0) could("datos", "Elegí temas: ayudan a que otras comunidades no choquen");

  if (!event.dateChosen) need("fecha", "Elegí y reservá la fecha");
  else if (Date.parse(event.startDate) < now) need("fecha", "La fecha ya pasó");

  if (event.mode === "online" && !event.onlineUrl) need("espacio", "Poné el link de la transmisión");
  if (event.mode === "hibrido" && !event.onlineUrl) could("espacio", "Falta el link de la transmisión");
  if (inPerson && !event.venueId && !event.placeName?.trim()) {
    could("espacio", "Sin lugar todavía: se publica como «Lugar a confirmar»");
  }

  if (event.registration === "external" && !event.registrationUrl) need("inscripcion", "Poné el link de inscripción");
  if (event.registration === "owu" && !event.capacity) could("inscripcion", "Sin cupo: se puede anotar cualquiera");
  if (event.registration === "eventbrite" && !event.capacity) {
    need("inscripcion", "Poné el cupo: Eventbrite lo pide para las entradas");
  }

  return list;
}

/** A step's badge: done, something required, or only suggestions left. */
export function stepState(step: StepKey, list: Issue[]) {
  const mine = list.filter((issue) => issue.step === step);
  if (mine.some((issue) => issue.level === "required")) return "required" as const;
  if (mine.length > 0) return "recommended" as const;

  return "done" as const;
}
