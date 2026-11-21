import { cacheLife } from "next/cache";
import { BLOG_DESCRIPTION, BLOG_NAME, SITE_URL } from "../(posts)/post-metadata";
import { getBlogPosts } from "../(posts)/posts";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Built with the deploy: getBlogPosts reads the filesystem, absent at runtime on Vercel
async function render() {
  "use cache";
  // A year: it never regenerates between deploys (the files it reads only exist at build), the way
  // `dynamic = "force-static"` behaved
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

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

  return xml;
}

export async function GET() {
  return new Response(await render(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
