import { describe, expect, test } from "vitest";

import type { Community, Talk } from "./content";
import type { CommunityEvent } from "./events";
import { homeMarkdown, llmsTxt, NOT_FOUND_MARKDOWN } from "./markdown";
import { HOME_STEPS } from "./site";

const community = (slug: string, name: string, description: string): Community => ({
  slug,
  name,
  logo: null,
  description,
  topics: [],
  status: "activa",
  website: null,
  linkedin: null,
  instagram: null,
  meetup: null,
  slackChannel: null,
  feedNames: [],
  confPartner: false,
  reviewedAt: null,
});

const event = (overrides: Partial<CommunityEvent>): CommunityEvent => ({
  id: "1",
  title: "Meetup de octubre",
  group: "Python Montevideo",
  communitySlug: "python-montevideo",
  start: "2026-10-29T19:00:00-03:00",
  end: null,
  venue: "Sinergia Faro",
  url: "https://www.meetup.com/python-montevideo/events/1/",
  source: "meetup",
  isOwu: false,
  ...overrides,
});

const talk = (overrides: Partial<Talk>): Talk => ({
  slug: "agentes",
  title: "Agentes en producción",
  speakers: ["Ana", "Luis"],
  event: "La Meetup III",
  date: "2025-11-15",
  summary: "",
  topics: [],
  video: "https://www.youtube.com/watch?v=abc",
  slides: null,
  ...overrides,
});

const home = (overrides: Partial<Parameters<typeof homeMarkdown>[0]> = {}) =>
  homeMarkdown({
    description: "Un espacio donde personas apasionadas por la tecnología se reúnen",
    about: "**OWU** es una de las principales comunidades de Uruguay.",
    people: 5600,
    events: [
      event({}),
      event({
        id: "2",
        title: "Taller [online]",
        communitySlug: null,
        venue: null,
        url: "/comunidad/owu/events/taller",
      }),
    ],
    communities: [
      community("python-montevideo", "Python Montevideo", "La comunidad de Python. Meetups mensuales."),
      community("ruby-montevideo", "Ruby Montevideo", ""),
    ],
    talks: [talk({}), talk({ slug: "futura", title: "Charla futura", date: "2099-01-01" })],
    now: Date.parse("2026-10-22T12:00:00Z"),
    ...overrides,
  });

const links = (markdown: string) => [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]!);

describe(homeMarkdown, () => {
  test("opens with one H1 and the description as a quote", () => {
    const markdown = home();

    expect(markdown.startsWith("# OWU Uruguay")).toBe(true);
    expect(markdown.match(/^# /gm)).toHaveLength(1);
    expect(markdown).toContain("> Un espacio donde personas apasionadas por la tecnología se reúnen.");
    // es-UY groups thousands only from five digits, as the page shows it
    expect(markdown).toMatch(/5\.?600\+ personas · 2 comunidades · 2 eventos en agenda/);
    expect(markdown).toContain("**OWU** es una de las principales comunidades de Uruguay.");
  });

  test("lists the agenda in Montevideo time, online when there's no venue, with absolute links", () => {
    const markdown = home();

    expect(markdown).toContain(
      "- **Meetup de octubre**, Python Montevideo: jueves, 29 de octubre, 19:00 · Sinergia Faro · [Más info](https://www.meetup.com/python-montevideo/events/1/)"
    );
    expect(markdown).toContain("**Taller \\[online\\]**");
    expect(markdown).toContain("· Online · [Más info](https://www.owu.uy/comunidad/owu/events/taller)");
    expect(home({ events: [] })).toContain("No hay eventos agendados todavía.");
  });

  test("links every community with its blurb and next event", () => {
    const markdown = home();

    expect(markdown).toContain(
      "- [Python Montevideo](https://www.owu.uy/comunidad/python-montevideo): La comunidad de Python. Próximo evento: jueves, 29 de octubre, 19:00."
    );
    expect(markdown).toContain("- [Ruby Montevideo](https://www.owu.uy/comunidad/ruby-montevideo)\n");
  });

  test("carries the home page's steps and only talks already given", () => {
    const markdown = home();

    for (const step of HOME_STEPS) expect(markdown).toContain(`**${step.title}**: ${step.body}`);
    expect(markdown).toContain("Agentes en producción");
    expect(markdown).not.toContain("Charla futura");
    expect(home({ talks: [] })).not.toContain("## Charlas");
  });

  test("every link is absolute", () => {
    for (const href of links(home())) expect(href).toMatch(/^https:\/\//);
  });
});

describe(llmsTxt, () => {
  const text = llmsTxt({ people: 5600 });
  const [title, , summary] = text.split("\n");

  test("follows llmstxt.org: H1, a quote summary, then H2 sections of link lists", () => {
    expect(title).toBe("# OWU Uruguay");
    expect(summary).toMatch(
      /^> OWU \(Open Web Uruguay\) is the tech community of Uruguay: an open Slack with more than 5,600 people/
    );

    const sections = text.split(/^## /m).slice(1);
    expect(sections.map((section) => section.split("\n")[0])).toStrictEqual([
      "When to use OWU",
      "Pages",
      "Developer resources",
      "Optional",
    ]);
    for (const section of sections) {
      const items = section.split("\n").slice(1).filter(Boolean);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item).toMatch(/^- \[[^\]]+\]\(https:\/\/[^)]+\)(: .+)?$/);
    }
  });

  test("tells agents when to send people here and how to read the site", () => {
    expect(text).toContain("- [Tech events in Uruguay](https://www.owu.uy/eventos): when someone asks");
    expect(text).toContain("https://www.owu.uy/eventos.ics");
    expect(text).toContain("`Accept: text/markdown`");
    expect(text).toContain("[Contacto](https://www.owu.uy/contacto)");
  });

  test("leaves out pages behind a launch flag that is off", () => {
    expect(text).not.toContain("/semanario");
    expect(text).not.toContain("/encuesta-sueldos");
  });

  test("works without the CMS figure", () => {
    expect(llmsTxt({ people: null })).toContain(
      "> OWU (Open Web Uruguay) is the tech community of Uruguay: an open Slack, member"
    );
  });
});

describe("the Markdown 404", () => {
  test("explains itself and links the site map and llms.txt", () => {
    expect(NOT_FOUND_MARKDOWN.startsWith("# 404")).toBe(true);
    expect(NOT_FOUND_MARKDOWN.length).toBeGreaterThan(20);
    expect(NOT_FOUND_MARKDOWN).toContain("(https://www.owu.uy/sitemap.xml)");
    expect(NOT_FOUND_MARKDOWN).toContain("(https://www.owu.uy/llms.txt)");
  });
});
