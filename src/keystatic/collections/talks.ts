import { collection, fields } from "@keystatic/core";

import { TOPICS } from "lib/community/topics";

export const TALK_EVENTS = [
  { value: "owu-conf-2026", label: "OWU CONF 2026" },
  { value: "la-meetup-2025", label: "La Meetup III" },
  { value: "la-meetup-2024", label: "La Meetup II" },
  { value: "la-meetup-2023", label: "La Meetup I" },
  { value: "otro", label: "Otro evento" },
] as const;

/** The talk archive behind /charlas: one entry per talk given at an OWU event. */
export const talks = collection({
  label: "Charlas",
  slugField: "title",
  columns: ["title", "event"],
  schema: {
    title: fields.slug({ name: { label: "Título", validation: { isRequired: true } } }),
    speakers: fields.array(fields.text({ label: "Nombre" }), {
      label: "Speakers",
      itemLabel: (props) => props.value,
      validation: { length: { min: 1 } },
    }),
    event: fields.select({ label: "Evento", options: [...TALK_EVENTS], defaultValue: "otro" }),
    date: fields.date({ label: "Fecha", validation: { isRequired: true } }),
    summary: fields.text({ label: "Resumen", multiline: true }),
    topics: fields.multiselect({ label: "Temas", options: [...TOPICS] }),
    video: fields.url({ label: "Video", description: "YouTube u otra grabación." }),
    slides: fields.url({ label: "Slides" }),
  },
  path: "content/talks/*/",
  format: { data: "yaml" },
});
