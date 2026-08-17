import { promises as fs } from "fs";
import path from "path";

import { DEFAULT_POST_AUTHOR, resolvePostImage, type PostInfo } from "./post-metadata";

export interface BlogPost {
  slug: string;
  title: string;
  description?: string;
  date: string;
  updated?: string;
  author: string;
  /** Always resolved: custom banner or the generated /blog/og image */
  image: string;
  tags: string[];
  readingMinutes: number;
}

interface PostModule {
  post?: unknown;
  metadata?: {
    title?: unknown;
    description?: unknown;
    openGraph?: { publishedTime?: unknown; authors?: unknown; images?: unknown };
  };
}

// Posts live next to this file as <slug>/page.mdx; fs only exists at build time,
// so consumers must stay statically generated (force-static).
const POSTS_DIR = path.join(process.cwd(), "src", "app", "(web)", "(content)", "blog", "(posts)");
const WORDS_PER_MINUTE = 200;

function hasPostPage(name: string) {
  return fs
    .access(path.join(POSTS_DIR, name, "page.mdx"))
    .then(() => true)
    .catch(() => false);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstString(value: unknown): string | undefined {
  return asString(Array.isArray(value) ? (value as unknown[])[0] : value);
}

function firstImageUrl(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? (value as unknown[])[0] : value;

  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate === "object" && "url" in candidate) {
    return asString((candidate as { url: unknown }).url);
  }

  return undefined;
}

/** Accepts the `post` export when it looks right; falls back to parsing `metadata` */
function parsePostInfo(slug: string, mod: PostModule): PostInfo {
  const raw = (mod.post ?? {}) as Partial<Record<keyof PostInfo, unknown>>;
  const fromMetadata = mod.metadata;

  const title = asString(raw.title) ?? asString(fromMetadata?.title) ?? slug;
  const description = asString(raw.description) ?? asString(fromMetadata?.description) ?? "";
  const date = asString(raw.date) ?? asString(fromMetadata?.openGraph?.publishedTime) ?? "1970-01-01T00:00:00.000Z";
  const tags = Array.isArray(raw.tags) ? (raw.tags as unknown[]).filter((tag) => typeof tag === "string") : [];

  return {
    slug,
    title,
    description,
    date,
    updated: asString(raw.updated),
    author: asString(raw.author) ?? firstString(fromMetadata?.openGraph?.authors),
    image: asString(raw.image) ?? firstImageUrl(fromMetadata?.openGraph?.images),
    tags: tags as string[],
  };
}

async function estimateReadingMinutes(slug: string) {
  const raw = await fs.readFile(path.join(POSTS_DIR, slug, "page.mdx"), "utf8").catch(() => "");
  const prose = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^(import|export)[\s\S]*?;$/gm, " ")
    .replace(/<[^>]+>/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true });
  // "_"-prefixed folders (e.g. _plantilla) are App Router private folders: they never
  // become routes, so they must not be listed — but _plantilla/page.mdx must exist so the
  // dynamic import() context below always has at least one match for the bundler.
  const candidates = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name);
  const checks = await Promise.all(candidates.map(hasPostPage));
  const slugs = candidates.filter((_, index) => checks[index]);

  const posts = await Promise.all(
    slugs.map(async (slug) => {
      const mod = (await import(`./${slug}/page.mdx`)) as unknown as PostModule;
      const info = parsePostInfo(slug, mod);

      return {
        ...info,
        author: info.author ?? DEFAULT_POST_AUTHOR,
        image: resolvePostImage(info),
        tags: info.tags ?? [],
        readingMinutes: await estimateReadingMinutes(slug),
      };
    })
  );

  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

/** Unique tags across posts, most used first (ties alphabetically) */
export function collectTags(posts: BlogPost[]): string[] {
  const counts = new Map<string, number>();

  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}
