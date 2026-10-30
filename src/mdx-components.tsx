import React, { type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { highlight } from "sugar-high";

import { isHiddenPost } from "lib/community/flags";

import {
  BLOG_NAME,
  DEFAULT_POST_AUTHOR,
  PUBLISHER_LOGO,
  SITE_URL,
  resolvePostImage,
  serializeJsonLd,
  showDrafts,
  type PostInfo,
} from "app/(web)/(content)/blog/(posts)/post-metadata";

type HeadingProps = ComponentPropsWithoutRef<"h1">;
type ParagraphProps = ComponentPropsWithoutRef<"p">;
type ListProps = ComponentPropsWithoutRef<"ul">;
type ListItemProps = ComponentPropsWithoutRef<"li">;
type AnchorProps = ComponentPropsWithoutRef<"a">;
type BlockquoteProps = ComponentPropsWithoutRef<"blockquote">;

// GFM tables compiled by mdxRs carry "\n" text nodes between table/thead/tr children,
// which is invalid HTML and triggers React hydration warnings — drop them.
function stripWhitespaceNodes(children: React.ReactNode) {
  return React.Children.toArray(children).filter((child) => !(typeof child === "string" && child.trim() === ""));
}

const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

// Anchor ids for plain-text headings ("Qué vas a encontrar" → "que-vas-a-encontrar"),
// so posts get deep-linkable sections without rehype plugins (unavailable under mdxRs).
function headingId(children: React.ReactNode) {
  if (typeof children !== "string") return undefined;

  return children
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function formatPostDate(date: string) {
  return new Date(date).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function postJsonLd(post: PostInfo, author: string) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const image = resolvePostImage(post);
  const organization = { "@type": "Organization", name: "OWU — Open Web Uruguay", url: SITE_URL };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        datePublished: post.date,
        dateModified: post.updated ?? post.date,
        inLanguage: "es",
        image: [image.startsWith("/") ? `${SITE_URL}${image}` : image],
        keywords: post.tags?.length ? post.tags.join(", ") : undefined,
        author: author === DEFAULT_POST_AUTHOR ? organization : { "@type": "Person", name: author },
        publisher: { ...organization, logo: { "@type": "ImageObject", url: PUBLISHER_LOGO } },
        isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/blog`, name: BLOG_NAME },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
    ],
  };
}

const linkClassName =
  "text-zinc-100 underline decoration-yellow-400/50 underline-offset-4 transition-colors hover:text-yellow-300 hover:decoration-yellow-300";

/** Section heading with a "#" link to itself that shows on hover, docs-style */
function AnchoredHeading({ as: Tag, className, children, ...props }: HeadingProps & { as: "h2" | "h3" }) {
  const id = headingId(children);

  return (
    <Tag className={`group scroll-mt-24 ${className}`} id={id} {...props}>
      {children}
      {id ? (
        <a
          aria-label="Link a esta sección"
          className="ml-2 font-terminal text-[0.7em] text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-yellow-400 focus-visible:opacity-100"
          href={`#${id}`}
        >
          #
        </a>
      ) : null}
    </Tag>
  );
}

const components = {
  h1: (props: HeadingProps) => (
    <h1
      className="mt-2 mb-3 text-4xl leading-[1.04] font-semibold tracking-[-0.035em] text-balance text-zinc-50 sm:text-5xl"
      {...props}
    />
  ),
  h2: (props: HeadingProps) => (
    <AnchoredHeading
      as="h2"
      className="mt-14 mb-4 text-2xl leading-tight font-semibold tracking-[-0.025em] text-zinc-50 sm:text-[1.7rem]"
      {...props}
    />
  ),
  h3: (props: HeadingProps) => (
    <AnchoredHeading
      as="h3"
      className="mt-10 mb-3 text-lg leading-snug font-semibold tracking-[-0.02em] text-zinc-50 sm:text-xl"
      {...props}
    />
  ),
  h4: (props: HeadingProps) => <h4 className="mt-6 mb-2 font-semibold text-zinc-50" {...props} />,
  p: (props: ParagraphProps) => <p className="my-5 text-[16.5px] leading-[1.75] text-zinc-300" {...props} />,
  ol: (props: ListProps) => (
    <ol
      className="my-5 list-decimal space-y-2 pl-5 text-[16.5px] text-zinc-300 marker:font-terminal marker:text-zinc-500"
      {...props}
    />
  ),
  ul: (props: ListProps) => (
    <ul className="my-5 list-disc space-y-2 pl-5 text-[16.5px] text-zinc-300 marker:text-zinc-600" {...props} />
  ),
  li: (props: ListItemProps) => <li className="pl-1 leading-[1.7]" {...props} />,
  em: (props: ComponentPropsWithoutRef<"em">) => <em className="italic" {...props} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => <strong className="font-semibold text-zinc-50" {...props} />,
  a: ({ children, href, ...props }: AnchorProps) => {
    if (href?.startsWith("/")) {
      return (
        <Link className={linkClassName} href={href} {...props}>
          {children}
        </Link>
      );
    }

    if (href?.startsWith("#")) {
      return (
        <a className={linkClassName} href={href} {...props}>
          {children}
        </a>
      );
    }

    return (
      <a className={linkClassName} href={href} rel="noopener noreferrer" target="_blank" {...props}>
        {children}
      </a>
    );
  },
  code: ({ children, ...props }: ComponentPropsWithoutRef<"code">) => {
    if (typeof children === "string") {
      return <code dangerouslySetInnerHTML={{ __html: highlight(children) }} {...props} />;
    }

    return <code {...props} />;
  },
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="my-6 overflow-x-auto rounded-xl border border-line bg-ink-elev p-4 text-sm leading-relaxed"
      {...props}
    />
  ),
  blockquote: (props: BlockquoteProps) => (
    <blockquote
      className="my-8 rounded-r-xl border-l-2 border-yellow-400 bg-yellow-400/[0.04] px-5 py-1 text-zinc-300 [&_p]:my-3"
      {...props}
    />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => <hr className="my-12 border-line" {...props} />,
  table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-8 w-full overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-sm" {...props}>
        {stripWhitespaceNodes(children)}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: ComponentPropsWithoutRef<"thead">) => (
    <thead {...props}>{stripWhitespaceNodes(children)}</thead>
  ),
  tbody: ({ children, ...props }: ComponentPropsWithoutRef<"tbody">) => (
    <tbody {...props}>{stripWhitespaceNodes(children)}</tbody>
  ),
  tr: ({ children, ...props }: ComponentPropsWithoutRef<"tr">) => (
    <tr className="border-b border-line last:border-b-0" {...props}>
      {stripWhitespaceNodes(children)}
    </tr>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th
      className="bg-white/[0.02] px-4 py-2.5 text-left font-terminal text-[11px] font-medium tracking-[0.08em] text-zinc-400 uppercase"
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => <td className="px-4 py-3 align-top text-zinc-300" {...props} />,
  // Renders the byline + tags and injects BlogPosting/BreadcrumbList JSON-LD.
  // Usage in a post: `<PostHeader post={post} />` right below the `# title`.
  PostHeader: ({ post }: { post: PostInfo }) => {
    // A draft never renders in production, nor a guide while the launch flag is off;
    // getBlogPosts also keeps both out of the index, feed and sitemap
    if ((post.draft && !showDrafts()) || isHiddenPost(post.tags)) notFound();

    const author = post.author ?? DEFAULT_POST_AUTHOR;

    return (
      <>
        {post.draft ? (
          <p className="mb-6 rounded-lg border border-orange-400/30 bg-orange-400/[0.07] px-4 py-3 font-terminal text-xs text-orange-300">
            Borrador · en revisión. No se publica hasta que alguien lo revise.
          </p>
        ) : null}
        <div className="mt-4 mb-10 flex flex-col gap-4 border-b border-line pb-8">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-terminal text-xs text-zinc-500">
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            <span aria-hidden>·</span>
            <span className="text-zinc-400">{author}</span>
            {post.updated ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  actualizado el <time dateTime={post.updated}>{formatPostDate(post.updated)}</time>
                </span>
              </>
            ) : null}
          </p>
          {post.tags?.length ? (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  className="rounded-full border border-line px-2.5 py-0.5 font-terminal text-[11px] text-zinc-400 transition-colors hover:border-yellow-400/40 hover:text-yellow-400"
                  href={`/blog?tag=${encodeURIComponent(tag)}`}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <script
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(postJsonLd(post, author)) }}
          type="application/ld+json"
        />
      </>
    );
  },
};

declare global {
  type MDXProvidedComponents = typeof components;
}

export function useMDXComponents(): MDXProvidedComponents {
  return components;
}
