import { BLOG_DESCRIPTION, BLOG_NAME, SITE_URL } from "../(posts)/post-metadata";
import { getBlogPosts } from "../(posts)/posts";

// Generated at build time (getBlogPosts reads the filesystem, absent at runtime on Vercel)
export const dynamic = "force-static";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await getBlogPosts();

  const items = posts
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      const categories = post.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join("");

      return [
        "<item>",
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<description>${escapeXml(post.description ?? "")}</description>`,
        `<pubDate>${new Date(post.date).toUTCString()}</pubDate>`,
        `<dc:creator>${escapeXml(post.author)}</dc:creator>`,
        categories,
        "</item>",
      ].join("");
    })
    .join("");

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    "<channel>" +
    `<title>${escapeXml(BLOG_NAME)}</title>` +
    `<link>${SITE_URL}/blog</link>` +
    `<description>${escapeXml(BLOG_DESCRIPTION)}</description>` +
    "<language>es-UY</language>" +
    `<atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml"/>` +
    items +
    "</channel>" +
    "</rss>";

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
