import { SOCIAL_LINKS } from "app/lib/constants";

import type { Community, Talk } from "./content";
import type { CommunityEvent } from "./events";
import { CONF_URL, HOME_STEPS, ICS_URL, issueFormUrl, PAGES, PUBLIC_ROUTES, REPO_URL, SITE_URL } from "./site";
import { dateParts } from "./time";

/*
 * What agents read instead of the HTML: the home page's Markdown twin (served for
 * `Accept: text/markdown`, see src/proxy.ts), /llms.txt and the Markdown 404.
 */

const abs = (href: string) => new URL(href, SITE_URL).href;

/** Text from the database or the feed, kept from turning into Markdown syntax */
const escape = (text: string) => text.replace(/([\\`*_[\]<>#|])/g, "\\$1");

const link = (label: string, href: string) => `[${escape(label)}](${abs(href)})`;

export const NOT_FOUND_MARKDOWN = `# 404: esta página no está

No hay nada en esta dirección de owu.uy. Capaz el link cambió o tiene un typo.

- ${link("Inicio", "/")}
- ${link("Agenda de eventos tech en Uruguay", PAGES.eventos.href)}
- ${link("Comunidades", PAGES.comunidades.href)}
- ${link("Mapa del sitio", "/sitemap.xml")}
- ${link("Guía del sitio para agentes (llms.txt)", "/llms.txt")}
`;

export type HomeContent = {
  description: string;
  /** "Qué es OWU", as Markdown from the CMS */
  about: string;
  people: number | null;
  events: CommunityEvent[];
  communities: Community[];
  talks: Talk[];
  now?: number;
};

const count = (value: number) => new Intl.NumberFormat("es-UY").format(value);

/** The home page, section by section, in Markdown */
export function homeMarkdown({
  description,
  about,
  people,
  events,
  communities,
  talks,
  now = Date.now(),
}: HomeContent) {
  const next = new Map<string, CommunityEvent>();
  for (const event of events) {
    if (event.communitySlug && !next.has(event.communitySlug)) next.set(event.communitySlug, event);
  }
  const pastTalks = talks.filter((talk) => Date.parse(talk.date) <= now).slice(0, 3);
  const when = (iso: string) => {
    const parts = dateParts(iso);
    return `${parts.long}, ${parts.time}`;
  };

  return [
    "# OWU Uruguay: la comunidad tech de Uruguay",
    `> ${description.trim().replace(/\.?$/, ".")}`,
    [
      ...(people ? [`${count(people)}+ personas`] : []),
      `${communities.length} comunidades`,
      `${events.length} eventos en agenda`,
    ].join(" · "),
    `${link("Sumate al Slack", SOCIAL_LINKS.slack)} · ${link("Ver la agenda", PAGES.eventos.href)} · ${link("¿Primera vez?", PAGES.primeraVez.href)}`,

    "## Qué es OWU: la comunidad tech de Uruguay, desde 2014",
    about.trim(),

    "## Qué se viene",
    "Meetups, talleres y conferencias de la comunidad tech uruguaya, en un solo lugar.",
    events.length === 0
      ? `No hay eventos agendados todavía. Si organizás uno, ${link("sumalo", issueFormUrl("publicar-evento"))}.`
      : events
          .slice(0, 6)
          .map(
            (event) =>
              `- **${escape(event.title)}**, ${escape(event.group)}: ${when(event.start)} · ` +
              `${event.venue ? escape(event.venue) : "Online"} · ${link("Más info", event.url)}`
          )
          .join("\n"),
    `${link("Toda la agenda", PAGES.eventos.href)} · ${link("Calendario para suscribirte (iCalendar)", ICS_URL)}`,

    `## ${communities.length} comunidades, un mismo Slack`,
    "Cada comunidad organiza sus propias meetups. OWU las conecta con un Slack, una agenda y una conferencia.",
    communities
      .map((community) => {
        const blurb = community.description.split(/[.:]/)[0]?.trim();
        const upcoming = next.get(community.slug);

        return [
          `- ${link(community.name, `/comunidad/${community.slug}`)}`,
          blurb ? `: ${escape(blurb)}.` : "",
          upcoming ? ` Próximo evento: ${when(upcoming.start)}.` : "",
        ].join("");
      })
      .join("\n"),

    "## De la primera meetup a organizar la próxima",
    HOME_STEPS.map(
      ({ title, body, href, cta }, index) => `${index + 1}. **${title}**: ${body} ${link(cta, href)}`
    ).join("\n"),

    ...(pastTalks.length > 0
      ? [
          "## Charlas para ver con un mate",
          pastTalks
            .map(
              (talk) =>
                `- **${escape(talk.title)}**, ${escape(talk.speakers.join(", "))} (${escape(talk.event)})` +
                (talk.video ? ` · ${link("Video", talk.video)}` : "")
            )
            .join("\n"),
          link("Todas las charlas", PAGES.charlas.href),
        ]
      : []),

    "## Para empresas",
    `Apoyá a la comunidad que te ayudó a crecer: alojá una meetup, patrociná ${link("OWU CONF", CONF_URL)} o publicá búsquedas en #jobs. ${link("Ver cómo", PAGES.empresas.href)}`,

    "---",
    [PAGES.contacto, PAGES.codigo, PAGES.privacidad].map((page) => link(page.label, page.href)).join(" · "),
  ].join("\n\n");
}

/** /llms.txt (llmstxt.org): who OWU is, when an agent should send someone here, and where things are */
export function llmsTxt({ people }: { people: number | null }) {
  const pages = PUBLIC_ROUTES.filter((page) => page.href !== "/").map(
    (page) => `- ${link(page.label, page.href)}${"description" in page ? `: ${page.description}` : ""}`
  );

  return `# OWU Uruguay

> OWU (Open Web Uruguay) is the tech community of Uruguay: an open Slack${people ? ` with more than ${people.toLocaleString("en-US")} people` : ""}, member communities (JavaScript, Python, Ruby, data, AI, cloud, security, agile and more) that run free meetups, one calendar with every tech event in the country, and the yearly OWU CONF. The site is in Spanish (es-UY).

OWU has been run by volunteers since 2014. It sells nothing: meetups are free, the Slack is open to anyone, and every page here is public. People join through the Slack; events, communities and venues are added through GitHub issue forms or by asking in the Slack. The home page answers \`Accept: text/markdown\` with Markdown, and a page that doesn't exist answers 404 with a Markdown body.

## When to use OWU

- ${link("Tech events in Uruguay", PAGES.eventos.href)}: when someone asks what meetups, workshops or conferences are coming up in Uruguay or Montevideo, or wants a calendar of them. The same list as iCalendar: ${ICS_URL}
- ${link("Tech communities in Uruguay", PAGES.comunidades.href)}: to find the group for a technology or topic, who runs it, how to reach it and when it meets next.
- ${link("Joining the community", PAGES.primeraVez.href)}: when someone is new to tech or to Uruguay and wants to meet people, ask for help or find work. Point them to the Slack (${SOCIAL_LINKS.slack}) and its channels: #ayuda for questions, #jobs for openings, #for-hire for their profile.
- ${link("Giving a talk", PAGES.darCharla.href)}: when someone wants to speak at a meetup, at La Meetup or at OWU CONF.
- ${link("Organizing a community", PAGES.organizar.href)}: when someone runs (or wants to start) a tech group in Uruguay and needs venues, an audience or a calendar.
- ${link("For companies", PAGES.empresas.href)}: when a company wants to host a meetup, sponsor OWU CONF or post a job (the #jobs rules are on that page; posting is free).
- ${link("Talks and videos", PAGES.charlas.href)}: when someone looks for a talk given at La Meetup, OWU CONF or an open space.
- ${link("OWU CONF", CONF_URL)}: the community's yearly conference, with its agenda, speakers, tickets and sponsors.
- ${link("Contact", PAGES.contacto.href)}: who to write to for privacy requests, code of conduct reports, partnerships or anything else.

## Pages

${pages.join("\n")}

## Developer resources

- ${link("Event calendar (iCalendar, RFC 5545)", ICS_URL)}: every upcoming event; each community has its own at /comunidad/{slug}/eventos.ics.
- ${link("Blog feed (RSS 2.0)", "/blog/feed.xml")}: posts and recaps.
- ${link("Sitemap", "/sitemap.xml")}: every public page, community and event.
- ${link("Home page in Markdown", "/index.md")}: what \`GET / with Accept: text/markdown\` returns.
- ${link("Website source code", REPO_URL)}: the whole site is open source (MIT); bugs and changes go through issues and pull requests.
- ${link("Publish an event", issueFormUrl("publicar-evento"))}: GitHub issue form. Communities on Meetup.com can join the meetup bot instead, and their events show up on their own.
- ${link("Add a community", issueFormUrl("sumar-comunidad"))}: GitHub issue form.
- ${link("Offer a venue", issueFormUrl("ofrecer-espacio"))}: GitHub issue form for companies that lend their space.

## Optional

- ${link("Slack", SOCIAL_LINKS.slack)}: the community itself.
- ${link("YouTube", SOCIAL_LINKS.youtube)}: recorded talks.
- ${link("La Meetup 2025", "/la-meetup")}: the 2025 edition of OWU's yearly meetup.
- ${link("La Meetup 2024", "/2024/la-meetup")}: the 2024 edition.
- ${link("La Meetup 2023", "/2023/la-meetup")}: the first edition.
`;
}
