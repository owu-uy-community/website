import { cacheLife } from "next/cache";
import { SITE_URL } from "lib/community/site";

import { excerpt, getIssues, weekRange } from "../data";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Re-rendered on publish; this is the fallback
async function render() {
  "use cache";
  cacheLife("hours");

  const issues = await getIssues();

  const items = issues
    .map((issue) => {
      const url = `${SITE_URL}/semanario/${issue.number}`;
      const description =
        excerpt(issue.intro, 400) || `Lo que pasó en la comunidad la semana del ${weekRange(issue.weekStart)}.`;

      return [
        "<item>",
        `<title>${escapeXml(`#${issue.number}: ${issue.title}`)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<description>${escapeXml(description)}</description>`,
        issue.publishedAt ? `<pubDate>${new Date(issue.publishedAt).toUTCString()}</pubDate>` : "",
        "</item>",
      ].join("");
    })
    .join("");

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">' +
    "<channel>" +
    "<title>Semanario OWU</title>" +
    `<link>${SITE_URL}/semanario</link>` +
    "<description>Lo que pasó en el Slack de OWU y lo que se viene, cada lunes.</description>" +
    "<language>es-UY</language>" +
    `<atom:link href="${SITE_URL}/semanario/feed.xml" rel="self" type="application/rss+xml"/>` +
    items +
    "</channel>" +
    "</rss>";

  return xml;
}

export async function GET() {
  return new Response(await render(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
