import { collection, fields } from "@keystatic/core";

import { TOPICS } from "lib/community/topics";

export const COMMUNITY_STATUSES = [
  { value: "activa", label: "Activa" },
  { value: "pausa", label: "En pausa" },
  { value: "busca-organizadores", label: "Busca organizadores" },
] as const;

export const communities = collection({
  label: "Comunidades",
  slugField: "name",
  columns: ["name", "status"],
  schema: {
    name: fields.slug({
      name: {
        label: "Nombre",
        validation: { isRequired: true },
      },
    }),
    picture: fields.image({
      label: "Logo",
      description: "Cuadrado, con el fondo del logo (blanco si no tiene) y aire alrededor: se muestra de borde a borde.",
      directory: "public/images/communities",
      publicPath: "/images/communities/",
    }),
    description: fields.text({
      label: "Descripción",
      description: "Una o dos líneas: de qué se trata y para quién es.",
      multiline: true,
      validation: { isRequired: true, length: { max: 220 } },
    }),
    topics: fields.multiselect({
      label: "Temas",
      options: [...TOPICS],
    }),
    status: fields.select({
      label: "Estado",
      description: "“En pausa” si no hubo eventos en los últimos 6 meses.",
      options: [...COMMUNITY_STATUSES],
      defaultValue: "activa",
    }),
    website: fields.url({ label: "Sitio web" }),
    meetup: fields.url({ label: "Página de eventos", description: "Meetup.com, gdg.community.dev, Luma…" }),
    slackChannel: fields.text({
      label: "Canal de Slack",
      description: "Sin el #, p. ej. ruby. Vacío si no tiene.",
    }),
    feedNames: fields.array(fields.text({ label: "Nombre" }), {
      label: "Nombres en el feed de eventos",
      description: "Cómo aparece el grupo en meetup-bot (p. ej. “OWASP Uruguay Chapter”), para mostrar su próximo evento.",
      itemLabel: (props) => props.value,
    }),
    confPartner: fields.checkbox({
      label: "Comunidad aliada de OWU CONF",
      defaultValue: false,
    }),
    reviewedAt: fields.date({
      label: "Revisada el",
      description: "Última vez que alguien confirmó estos datos con el grupo.",
    }),
  },
  path: "content/communities/*/",
  format: { data: "yaml" },
});
