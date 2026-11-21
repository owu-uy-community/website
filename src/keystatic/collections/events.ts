import { collection, fields } from "@keystatic/core";

/**
 * Events from groups that don't publish on meetup.com. The site merges them with
 * the meetup-bot feed into /eventos, the home and /eventos.ics.
 */
export const events = collection({
  label: "Eventos (carga manual)",
  slugField: "title",
  columns: ["title", "start"],
  schema: {
    title: fields.slug({ name: { label: "Título", validation: { isRequired: true } } }),
    community: fields.relationship({
      label: "Comunidad",
      description: "Si el grupo está en el directorio.",
      collection: "communities",
    }),
    organizer: fields.text({
      label: "Organiza",
      description: "Nombre a mostrar si el grupo no está en el directorio.",
    }),
    start: fields.datetime({
      label: "Empieza",
      description: "Hora de Montevideo.",
      validation: { isRequired: true },
    }),
    end: fields.datetime({ label: "Termina", description: "Hora de Montevideo." }),
    venue: fields.text({ label: "Lugar", description: "Vacío si es online." }),
    url: fields.url({ label: "Link de inscripción o info", validation: { isRequired: true } }),
  },
  path: "content/events/*/",
  format: { data: "yaml" },
});
