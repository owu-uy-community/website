/**
 * The tasks a meetup usually needs, per kind of event, each a number of days before (or after)
 * its start: "pedir el lugar" a month before, "agradecer" the day after. Applying one makes
 * staff_tasks rows keyed "<template>:<task>", so applying it twice adds nothing and a task moves
 * when the event moves (unless it's done). Client-safe.
 */
import { addDays } from "../calendar/holidays";
import { dayKey } from "../community/time";

export const TEMPLATES = ["charlas", "taller", "social", "coorganizado", "online"] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export type TemplateTask = { key: string; title: string; offsetDays: number };

export const TEMPLATE_LABEL: Record<TemplateName, string> = {
  charlas: "Noche de charlas",
  taller: "Taller",
  social: "Social",
  coorganizado: "Con otra comunidad",
  online: "Online",
};

const thanks: TemplateTask = {
  key: "gracias",
  title: "Agradecer al espacio, a quienes hablaron y a quienes ayudaron",
  offsetDays: 1,
};
const door: TemplateTask = {
  key: "puerta",
  title: "Armar el link de la puerta y pasárselo a quien ayuda",
  offsetDays: -3,
};
const food: TemplateTask = { key: "comida", title: "Encargar la comida", offsetDays: -2 };
const slides: TemplateTask = { key: "slides", title: "Juntar las slides y probar el proyector", offsetDays: -1 };
const hands: TemplateTask = { key: "mano", title: "Pedir una mano: recepción, puerta, fotos", offsetDays: -7 };

export const TEMPLATE_TASKS: Record<TemplateName, TemplateTask[]> = {
  charlas: [
    { key: "lugar", title: "Pedir el lugar", offsetDays: -30 },
    { key: "charlas", title: "Confirmar las charlas", offsetDays: -21 },
    { key: "anunciar", title: "Anunciarlo", offsetDays: -21 },
    hands,
    door,
    food,
    slides,
    thanks,
  ],
  taller: [
    { key: "lugar", title: "Pedir un lugar con mesas y enchufes", offsetDays: -35 },
    { key: "anunciar", title: "Anunciarlo (los talleres, con 4 semanas)", offsetDays: -28 },
    { key: "material", title: "Probar el material del taller de punta a punta", offsetDays: -7 },
    { key: "requisitos", title: "Mandar qué traer y qué instalar", offsetDays: -3 },
    door,
    food,
    thanks,
  ],
  social: [
    { key: "lugar", title: "Reservar el lugar", offsetDays: -21 },
    { key: "anunciar", title: "Anunciarlo", offsetDays: -14 },
    { key: "confirmar", title: "Confirmar la reserva y cuántos van", offsetDays: -2 },
    thanks,
  ],
  coorganizado: [
    { key: "repartir", title: "Repartir las tareas con la otra comunidad", offsetDays: -35 },
    { key: "lugar", title: "Pedir el lugar", offsetDays: -30 },
    { key: "charlas", title: "Confirmar las charlas", offsetDays: -21 },
    { key: "anunciar", title: "Anunciarlo en las dos comunidades", offsetDays: -21 },
    hands,
    door,
    food,
    slides,
    thanks,
  ],
  online: [
    { key: "charlas", title: "Confirmar las charlas", offsetDays: -21 },
    { key: "anunciar", title: "Anunciarlo", offsetDays: -21 },
    { key: "prueba", title: "Probar la transmisión con quienes hablan", offsetDays: -7 },
    { key: "link", title: "Revisar el link de la transmisión", offsetDays: -2 },
    slides,
    { key: "grabacion", title: "Subir la grabación", offsetDays: 1 },
    thanks,
  ],
};

/** The template that fits an event best: online first, then the format, then co-organized. */
export function templateFor(event: { mode: string; format: string | null; cohosts: readonly unknown[] }): TemplateName {
  if (event.mode === "online") return "online";
  if (event.format === "taller" || event.format === "hackathon") return "taller";
  if (event.format === "social") return "social";
  if (event.cohosts.length > 0) return "coorganizado";

  return "charlas";
}

/** "charlas:lugar" → the task it was made from; null for a task that isn't from a template. */
export function templateTask(templateKey: string | null) {
  const [name, key] = (templateKey ?? "").split(":");
  const tasks = TEMPLATE_TASKS[name as TemplateName] as TemplateTask[] | undefined;

  return tasks?.find((task) => task.key === key) ?? null;
}

/** The Montevideo day a template task is due for an event starting at `startDate` ("YYYY-MM-DD"). */
export const dueDay = (startDate: string | Date, offsetDays: number) => addDays(dayKey(startDate), offsetDays);

/** What applying a template makes: one task per row, keyed and dated from the event's start. */
export const planTemplate = (name: TemplateName, startDate: string | Date) =>
  TEMPLATE_TASKS[name].map((task, index) => ({
    templateKey: `${name}:${task.key}`,
    title: task.title,
    day: dueDay(startDate, task.offsetDays),
    sortOrder: index,
  }));

/**
 * After the event moves: the template tasks that change day, with their new one. Done tasks stay
 * where they were (they happened then), and tasks not made from a template never move.
 */
export function moved(
  tasks: readonly { id: string; templateKey: string | null; status: string; day: string }[],
  startDate: string | Date
) {
  return tasks.flatMap((task) => {
    const template = templateTask(task.templateKey);
    if (!template || task.status === "done") return [];
    const day = dueDay(startDate, template.offsetDays);

    return day === task.day ? [] : [{ id: task.id, day }];
  });
}

/** Nudges go out from 09:00 on the due day (Montevideo), not at midnight */
const NUDGE_HOUR = 9;

/** The due day the nudge sweep is on: today from 09:00, still yesterday before that. */
export const nudgeDay = (now = new Date()) => dayKey(new Date(now.getTime() - NUDGE_HOUR * 3_600_000));

/** The share of done tasks one person did, when it's more than 70% of at least 6: time to share the load. */
export const LOAD_SHARE = 0.7;
export const LOAD_MIN_TASKS = 6;

export function heavyLoad(doneBy: readonly (string | null)[]) {
  const counted = doneBy.filter((id): id is string => id !== null);
  if (counted.length < LOAD_MIN_TASKS) return null;
  const tally = new Map<string, number>();
  for (const id of counted) tally.set(id, (tally.get(id) ?? 0) + 1);
  const [top, most] = [...tally].toSorted((a, b) => b[1] - a[1])[0];
  const share = most / counted.length;

  return share > LOAD_SHARE ? { userId: top, share } : null;
}
