/**
 * "Antes": what an event needs before its day, each row computed from the event itself (never
 * ticked by hand) and with the exact place where it gets done. GOV.UK's task list: the whole row
 * is the link, "Listo" in plain words. Client-safe.
 */
import { shortWhen } from "../community/time";
import type { EditableEvent } from "../orpc/events/schemas";
import { respondersNeeded } from "./steps";

export type ChecklistRow = { key: string; title: string; meta: string; done: boolean; href: string };

export type ChecklistInput = {
  event: Pick<
    EditableEvent,
    | "id"
    | "startDate"
    | "dateChosen"
    | "mode"
    | "format"
    | "venue"
    | "placeName"
    | "onlineUrl"
    | "talks"
    | "registration"
    | "registrationUrl"
    | "capacity"
    | "waitlist"
    | "externalLinks"
    | "announcements"
    | "responders"
    | "reminderNote"
  >;
  /** A volunteer door link is out */
  doorLink: boolean;
  /** The survey: open, made but closed (false), or none (null) */
  surveyOpen: boolean | null;
  /** The template's "comida" task: done, pending, or there's none (null) */
  foodDone: boolean | null;
  /** "Para ~34: 11 pizzas…", once the numbers are in */
  food: string | null;
};

/** Rows that apply to this event, in the order a meetup gets ready. `base` is the event's panel path. */
export function eventChecklist({ event, doorLink, surveyOpen, foodDone, food }: ChecklistInput, base: string) {
  const inPerson = event.mode !== "online";
  const owu = event.registration === "owu";
  const signUp = owu || event.registration === "eventbrite";
  const place = event.venue?.name ?? event.placeName;
  const talks = event.talks.filter((talk) => talk.title.trim()).length;
  const needed = Math.max(1, respondersNeeded(event.capacity));
  const announced = event.announcements.filter((post) => post.status === "sent").length;
  const tab = (key: string, anchor = "") => `${base}?tab=${key}${anchor ? `#${anchor}` : ""}`;

  const rows: (ChecklistRow | false)[] = [
    {
      key: "fecha",
      title: "Fecha",
      meta: event.dateChosen ? shortWhen(event.startDate) : "Elegí y reservá el día",
      done: event.dateChosen,
      href: `${base}/editar?paso=fecha`,
    },
    inPerson && {
      key: "lugar",
      title: "Lugar",
      meta: place ?? "Elegí un espacio o poné la dirección",
      done: Boolean(place),
      href: `${base}/editar?paso=espacio`,
    },
    event.mode !== "presencial" && {
      key: "online",
      title: "Link de la transmisión",
      meta: event.onlineUrl ? "Le llega a quien confirma" : "Falta el link",
      done: Boolean(event.onlineUrl),
      href: `${base}/editar?paso=espacio&campo=online-url`,
    },
    (event.format === "charlas" || event.format === "taller" || talks > 0) && {
      key: "charlas",
      title: "Charlas",
      meta: talks > 0 ? `${talks} ${talks === 1 ? "charla" : "charlas"}` : "Sumá quién habla y de qué",
      done: talks > 0,
      href: `${base}/editar?paso=datos&campo=charlas`,
    },
    {
      key: "inscripcion",
      title: "Inscripción",
      ...(owu
        ? {
            meta: event.capacity
              ? `${event.capacity} lugares, ${event.waitlist ? "con" : "sin"} lista de espera`
              : "Sin cupo: poné cuántos entran",
            done: event.capacity !== null,
          }
        : event.registration === "eventbrite"
          ? { meta: "En Eventbrite", done: event.capacity !== null }
          : event.registration === "external"
            ? { meta: event.registrationUrl ? "En otro sitio" : "Falta el link", done: Boolean(event.registrationUrl) }
            : { meta: "Entrada libre, sin anotarse", done: true }),
      href: tab("ajustes", "inscripcion"),
    },
    {
      key: "difusion",
      title: "Difusión",
      meta:
        [event.externalLinks.meetup ? "En Meetup" : "", announced ? "Owy lo anunció" : ""]
          .filter(Boolean)
          .join(" · ") || "Solo en owu.uy: publicalo en Meetup o compartí las tarjetas",
      done: Boolean(event.externalLinks.meetup) || announced > 0,
      href: tab("difusion"),
    },
    signUp &&
      inPerson && {
        key: "puerta",
        title: "Link de la puerta",
        meta: doorLink ? "Ya lo tiene quien ayuda" : "Para quien ayuda en la puerta, sin cuenta",
        done: doorLink,
        href: tab("puerta", "puerta-link"),
      },
    {
      key: "encuesta",
      title: "Encuesta",
      meta: surveyOpen ? "Abierta: les llega después" : surveyOpen === false ? "Creada, sin abrir" : "Sin encuesta",
      done: surveyOpen === true,
      href: tab("despues", "encuesta"),
    },
    {
      key: "conducta",
      title: "Responsables de conducta",
      meta:
        event.responders.length >= needed
          ? `${event.responders.length} ${event.responders.length === 1 ? "persona" : "personas"}`
          : needed === 2
            ? "Nombrá 2: es para más de 60"
            : "Nombrá a quién acudir si algo no está bien",
      done: event.responders.length >= needed,
      href: tab("ajustes", "conducta"),
    },
    owu && {
      key: "recordatorio",
      title: "Recordatorio con nota",
      meta: event.reminderNote ? "Sale 48 h y 2 h antes con tu nota" : "Sumales cómo entrar o qué traer",
      done: Boolean(event.reminderNote?.trim()),
      href: tab("mensajes", "recordatorio"),
    },
    owu &&
      inPerson && {
        key: "comida",
        title: "Comida",
        meta: food ?? "Cuánta pedir, con los anotados",
        done: foodDone === true,
        href: tab("hoy", "comida"),
      },
  ];

  return rows.filter((row) => row !== false);
}
