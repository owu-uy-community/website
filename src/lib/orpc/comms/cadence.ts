import { wallClock } from "../../slot-day";

/**
 * A conf's communication, step by step. The keys are stored in `outbound_messages.step` and the
 * shell counts them for the preparation checklist: don't rename them. "Durante" (the wall during
 * the day) is not a message, so it has no key.
 */
export const CADENCE_STEPS = ["t-7", "t-1", "morning", "t+1"] as const;
export type CadenceStepKey = (typeof CADENCE_STEPS)[number];

export type CadenceEvent = { name: string; startDate: Date; timezone: string };

export type CadenceLinks = {
  agenda: string;
  survey: string;
  map: string | null;
  /** Owy on Telegram (t.me/…), when the bot's username is configured. */
  owy: string | null;
};

export type CadencePlanStep = {
  key: CadenceStepKey;
  title: string;
  description: string;
  /** T-7 goes out from Eventbrite by hand; the rest, from Owy. */
  channel: "email" | "telegram";
  at: Date;
  subject: string | null;
  body: string;
};

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The instant a wall-clock day and time name in a time zone: "2026-11-06" "10:00" in Montevideo is 13:00Z. */
export function zonedInstant(day: string, time: string, timeZone: string): Date {
  const naive = Date.parse(`${day}T${time}:00Z`);
  const offset = (at: number) => Date.parse(`${wallClock(new Date(at), timeZone)}:00Z`) - at;

  // The second pass lands on the right side of a daylight-saving change.
  return new Date(naive - offset(naive - offset(naive)));
}

const dateParts = (at: Date, timeZone: string, style: "long" | "short") =>
  Object.fromEntries(
    new Intl.DateTimeFormat("es-UY", { timeZone, weekday: style, day: "numeric", month: style })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  );

/** "vie 6 nov · 10:00" on an event's clock (the day alone without `withTime`). */
export function formatWhen(at: Date | string, timeZone: string, withTime = true): string {
  const date = new Date(at);
  const { weekday, day, month } = dateParts(date, timeZone, "short");
  const label = `${weekday} ${day} ${month.replace(".", "")}`;

  return withTime ? `${label} · ${wallClock(date, timeZone).slice(11)}` : label;
}

const lines = (...parts: (string | null | false)[]) =>
  parts.filter((part) => part !== null && part !== false).join("\n");

/** Each step's suggested time and its Spanish copy, filled in from the event. */
export function cadencePlan(event: CadenceEvent, links: CadenceLinks): CadencePlanStep[] {
  const timeZone = event.timezone;
  const day = wallClock(event.startDate, timeZone).slice(0, 10);
  const opens = wallClock(event.startDate, timeZone).slice(11);
  const { weekday, day: dayOfMonth, month } = dateParts(event.startDate, timeZone, "long");
  const date = `${weekday} ${dayOfMonth} de ${month}`;
  const at = (days: number, time: string) => zonedInstant(addDays(day, days), time, timeZone);
  const name = event.name;

  return [
    {
      key: "t-7",
      title: "Email a inscriptos",
      description: "Sale desde Eventbrite: copiá el texto, mandalo a todos los inscriptos y marcalo como enviado.",
      channel: "email",
      at: at(-7, "10:00"),
      subject: `Falta una semana para ${name}`,
      body: lines(
        `¡Hola! Falta una semana para ${name}: te esperamos el ${date} desde las ${opens}.`,
        "",
        `La agenda y las salas: ${links.agenda}`,
        links.map && `Cómo llegar: ${links.map}`,
        links.owy && `Owy responde tus dudas en Telegram: ${links.owy}`,
        "",
        "Traé tu entrada en el celular. ¡Nos vemos!"
      ),
    },
    {
      key: "t-1",
      title: "Recordatorio de Owy",
      description: "El día antes, a media mañana, en el canal de Telegram.",
      channel: "telegram",
      at: at(-1, "10:00"),
      subject: null,
      body: lines(
        `Mañana es ${name}: abrimos a las ${opens}.`,
        `Agenda y salas: ${links.agenda}`,
        links.map && `Cómo llegar: ${links.map}`,
        "Traé tu entrada en el celular. ¡Nos vemos!"
      ),
    },
    {
      key: "morning",
      title: "Mañana del evento",
      description: "Owy abre el día unas horas antes de la acreditación.",
      channel: "telegram",
      at: at(0, "09:00"),
      subject: null,
      body: lines(
        `¡Hoy es ${name}! Abrimos a las ${opens}.`,
        `La agenda se actualiza en vivo: ${links.agenda}`,
        links.owy ? `¿Dudas? Escribime: ${links.owy}` : "¿Dudas? Preguntale a cualquiera del staff."
      ),
    },
    {
      key: "t+1",
      title: "Gracias y encuesta",
      description: "Al día siguiente, con el link a la encuesta.",
      channel: "telegram",
      at: at(1, "10:00"),
      subject: null,
      body: lines(`¡Gracias por venir a ${name}!`, `¿Nos contás qué te pareció? Son dos minutos: ${links.survey}`),
    },
  ];
}
