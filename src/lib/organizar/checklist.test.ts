import { describe, expect, test } from "vitest";

import type { EditableEvent } from "../orpc/events/schemas";
import { eventChecklist, type ChecklistInput } from "./checklist";
import { eventPhase } from "./rules";

const event: ChecklistInput["event"] = {
  id: "e",
  startDate: "2026-11-19T22:00:00.000Z",
  dateChosen: true,
  mode: "presencial",
  format: "charlas",
  venue: null,
  placeName: "Sala 301",
  onlineUrl: null,
  talks: [{ title: "Rust en producción", speaker: "Ana" }],
  registration: "owu",
  registrationUrl: null,
  capacity: 40,
  waitlist: true,
  externalLinks: {},
  announcements: [],
  responders: ["ana"],
  reminderNote: null,
};
const base = "/organizar/panel/c/eventos/e";
const ready: ChecklistInput = { event, doorLink: true, surveyOpen: true, foodDone: true, food: "Para ~22" };
const pending = (input: ChecklistInput) =>
  eventChecklist(input, base)
    .filter((row) => !row.done)
    .map((row) => row.key);

describe(eventChecklist, () => {
  test("a talk night with OWU sign-up has ten rows, each with where it gets done", () => {
    const rows = eventChecklist(ready, base);

    expect(rows.map((row) => row.key)).toStrictEqual([
      "fecha",
      "lugar",
      "charlas",
      "inscripcion",
      "difusion",
      "puerta",
      "encuesta",
      "conducta",
      "recordatorio",
      "comida",
    ]);
    expect(rows.find((row) => row.key === "charlas")?.href).toBe(`${base}/editar?paso=datos&campo=charlas`);
    expect(rows.find((row) => row.key === "puerta")?.href).toBe(`${base}?tab=puerta#puerta-link`);
  });

  test("what's missing comes from the data: no Meetup or Owy post, no note, no food task done", () => {
    expect(pending({ ...ready, foodDone: null })).toStrictEqual(["difusion", "recordatorio", "comida"]);
  });

  test("past 60 lugares one responder isn't enough; an online event asks for its link, not a place or a door", () => {
    const online = { ...event, mode: "online" as const, capacity: 120, reminderNote: "Traé preguntas" };
    const announced: EditableEvent["announcements"] = [{ channel: "slack", status: "sent", sentAt: null }];

    expect(pending({ ...ready, event: { ...online, announcements: announced } })).toStrictEqual(["online", "conducta"]);
  });

  test("open door, no sign-up: nothing to set up for inscripción, puerta or recordatorio", () => {
    const keys = eventChecklist({ ...ready, event: { ...event, registration: "none" } }, base).map((row) => row.key);

    expect(keys).toStrictEqual(["fecha", "lugar", "charlas", "inscripcion", "difusion", "encuesta", "conducta"]);
  });
});

describe(eventPhase, () => {
  const meetup = { startDate: "2026-11-19T22:00:00.000Z", endDate: "2026-11-20T00:00:00.000Z" };
  const at = (iso: string) => eventPhase(meetup, Date.parse(iso));

  test("antes until an hour before, the day from then until two hours after the end, después after", () => {
    expect([
      at("2026-11-19T20:59:00.000Z"),
      at("2026-11-19T21:00:00.000Z"),
      at("2026-11-20T02:00:00.000Z"),
      at("2026-11-20T02:01:00.000Z"),
    ]).toStrictEqual(["antes", "dia", "dia", "despues"]);
  });
});
