import type { Metadata } from "next";

export const SITE_URL = "https://www.owu.uy";
export const SITE_NAME = "OWU Uruguay";
export const BLOG_NAME = "Blog de OWU";
export const BLOG_DESCRIPTION = "Historias, aprendizajes y novedades de la comunidad TI de Uruguay.";
export const DEFAULT_POST_AUTHOR = "Comunidad OWU";
export const PUBLISHER_LOGO = `${SITE_URL}/images/logos/owu.webp`;

/**
 * Single source of truth for a post: export it as `post` from the page.mdx,
 * pass it to `postMetadata()` and to `<PostHeader post={post} />`.
 */
export interface PostInfo {
  title: string;
  description: string;
  /** Must match the folder name — it becomes /blog/<slug> */
  slug: string;
  /** ISO date, e.g. "2026-08-16T12:00:00.000Z" — also drives the index/sitemap ordering */
  date: string;
  /** ISO date of the last significant edit (optional) */
  updated?: string;
  author?: string;
  /** Custom banner (in public/). Without it, a branded OG image is generated at /blog/og */
  image?: string;
  /** Lowercase, short, reusable across posts, e.g. ["meetups", "comunidad"] */
  tags?: string[];
}

/** JSON-LD-safe serialization: escapes "<" so content can never close the script tag */
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Branded, auto-generated social image (see blog/og/route.tsx) */
export function ogImageUrl({ author, tags, title }: Pick<PostInfo, "author" | "tags" | "title">) {
  const params = new URLSearchParams({ title });

  if (author) params.set("author", author);
  if (tags?.[0]) params.set("tag", tags[0]);

  return `/blog/og?${params.toString()}`;
}

export function resolvePostImage(post: PostInfo) {
  return post.image ?? ogImageUrl({ ...post, author: post.author ?? DEFAULT_POST_AUTHOR });
}

// A page's `openGraph` replaces the root layout's entirely (shallow merge),
// so every post needs a complete object — images included — or og:image is lost.
export function postMetadata(post: PostInfo): Metadata {
  const { author = DEFAULT_POST_AUTHOR, date, description, slug, tags = [], title, updated } = post;
  const url = `${SITE_URL}/blog/${slug}`;
  const image = resolvePostImage(post);

  return {
    title,
    description,
    authors: [{ name: author }],
    keywords: tags,
    category: tags[0],
    alternates: {
      canonical: `/blog/${slug}`,
      types: { "application/rss+xml": "/blog/feed.xml" },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "es_UY",
      type: "article",
      publishedTime: date,
      modifiedTime: updated ?? date,
      authors: [author],
      tags,
      images: [post.image ? { url: image, alt: title } : { url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
