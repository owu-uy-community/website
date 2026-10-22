import { SOCIAL_LINKS } from "app/lib/constants";

import { isHiddenPath } from "./flags";

export const SITE_URL = "https://www.owu.uy";
export const CONF_URL = "https://conf.owu.uy";
export const REPO_URL = "https://github.com/owu-uy-community/website";

/** Where code-of-conduct reports go */
export const CONDUCT_EMAIL = "conducta@owu.uy";

/** A prefilled GitHub issue form in the website repo (.github/ISSUE_TEMPLATE/<template>.yml) */
export const issueFormUrl = (template: "sumar-comunidad" | "publicar-evento" | "ofrecer-espacio") =>
  `${REPO_URL}/issues/new?template=${template}.yml`;

/** "Editá esta página": the source of a route in the repo */
export const sourceUrl = (path: string) => `${REPO_URL}/tree/main/${path}`;

export const ICS_PATH = "/eventos.ics";
export const ICS_URL = `${SITE_URL}${ICS_PATH}`;

export type SiteLink = { href: string; label: string; description?: string; external?: boolean };

export const PAGES = {
  home: { href: "/", label: "Inicio" },
  comunidades: {
    href: "/comunidades",
    label: "Comunidades",
    description: "Las comunidades que hacen OWU, con su próximo evento",
  },
  eventos: {
    href: "/eventos",
    label: "Eventos",
    description: "La agenda tech de Uruguay, con calendario para suscribirte",
  },
  charlas: {
    href: "/charlas",
    label: "Charlas",
    description: "Todo lo que se habló en La Meetup, OWU CONF y los open spaces",
  },
  blog: { href: "/blog", label: "Blog", description: "Guías, recaps y novedades" },
  semanario: { href: "/semanario", label: "Semanario", description: "Lo que pasó en el Slack, cada lunes" },
  primeraVez: {
    href: "/primera-vez",
    label: "¿Primera vez?",
    description: "Qué esperar de tu primera meetup y cómo usar el Slack",
  },
  codigo: {
    href: "/codigo-de-conducta",
    label: "Código de conducta",
    description: "Cómo nos tratamos y cómo reportar",
  },
  darCharla: { href: "/dar-una-charla", label: "Dá una charla", description: "Dónde proponerla y cómo prepararla" },
  organizar: { href: "/organizar", label: "Organizá con OWU", description: "Qué te da OWU si organizás una comunidad" },
  empresas: {
    href: "/empresas",
    label: "Para empresas",
    description: "Alojá una meetup, patrociná, publicá búsquedas",
  },
  encuesta: {
    href: "/encuesta-sueldos",
    label: "Encuesta de sueldos",
    description: "Datos abiertos de sueldos tech en Uruguay",
  },
  conf: { href: CONF_URL, label: "OWU CONF", description: "La conferencia anual de la comunidad", external: true },
} satisfies Record<string, SiteLink>;

export const NAV_LINKS: SiteLink[] = [PAGES.comunidades, PAGES.eventos, PAGES.charlas, PAGES.blog, PAGES.conf];

export const FOOTER_COLUMNS: { title: string; links: SiteLink[] }[] = [
  {
    title: "Comunidad",
    links: [
      PAGES.primeraVez,
      PAGES.comunidades,
      PAGES.codigo,
      { href: "/primera-vez#preguntas", label: "Preguntas frecuentes" },
    ],
  },
  {
    title: "Participar",
    links: [
      PAGES.eventos,
      { href: issueFormUrl("publicar-evento"), label: "Publicá tu evento", external: true },
      PAGES.darCharla,
      PAGES.organizar,
    ],
  },
  {
    title: "Leer",
    links: [PAGES.charlas, PAGES.blog, PAGES.semanario, PAGES.encuesta],
  },
  {
    title: "Empresas",
    links: [PAGES.empresas, { href: "/empresas#jobs", label: "Reglas de #jobs" }, PAGES.conf],
  },
].map((column) => ({ ...column, links: column.links.filter((link) => !isHiddenPath(link.href)) }));

export const SOCIALS = [
  { key: "slack", label: "Slack", href: SOCIAL_LINKS.slack },
  { key: "github", label: "GitHub", href: SOCIAL_LINKS.github },
  { key: "youtube", label: "YouTube", href: SOCIAL_LINKS.youtube },
  { key: "linkedin", label: "LinkedIn", href: SOCIAL_LINKS.linkedin },
  { key: "instagram", label: "Instagram", href: SOCIAL_LINKS.instagram },
  { key: "telegram", label: "Telegram", href: SOCIAL_LINKS.telegram },
] as const;

/** Public routes for the sitemap and the command palette */
export const PUBLIC_ROUTES = Object.values(PAGES).filter(
  (page) => !("external" in page && page.external) && !isHiddenPath(page.href)
);

/**
 * Exact names (as they appear in the meetup-bot feed or a hand-added event's
 * organizer) of events OWU itself organizes; they get the "Organiza OWU" badge.
 * Add each new edition here.
 */
export const OWU_FEED_NAMES = ["OWU", "OWU Conf 2026", "OWU CONF 2026", "La Meetup"];

/**
 * Slack channels the pages mention by name, as they exist in the OWU workspace (checked
 * 2026-10-22; the pinned "Listado de canales" in #general is the source of the basics).
 * `semanario` doesn't exist yet: create it before turning the resources flag on.
 */
export const SLACK_CHANNELS = {
  general: "general",
  anuncios: "anuncios",
  ayuda: "ayuda",
  jobs: "jobs",
  forHire: "for-hire",
  autobombo: "autobombo",
  marketplace: "marketplace",
  random: "random",
  organizers: "organizadores-meetups",
  admin: "owu-slack-administracion",
  impuestos: "asesoramiento-impositivo",
  semanario: "semanario",
} as const;

/** The repo of the bot that posts the meetups every Monday in #anuncios and feeds /eventos */
export const MEETUP_BOT_REPO = "https://github.com/marpo60/meetup_bot";
