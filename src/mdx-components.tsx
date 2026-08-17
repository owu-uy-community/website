import React, { type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { highlight } from "sugar-high";

import {
  BLOG_NAME,
  DEFAULT_POST_AUTHOR,
  PUBLISHER_LOGO,
  SITE_URL,
  resolvePostImage,
  serializeJsonLd,
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
  "text-yellow-400 underline decoration-yellow-400/40 underline-offset-4 transition-colors hover:text-yellow-300 hover:decoration-yellow-300/60";

const components = {
  h1: (props: HeadingProps) => (
    <h1
      className="mb-2 mt-4 font-title text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl"
      {...props}
    />
  ),
  h2: ({ children, ...props }: HeadingProps) => (
    <h2
      className="mb-3 mt-10 scroll-mt-24 font-title text-xl font-bold tracking-tight text-white sm:text-2xl"
      id={headingId(children)}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: HeadingProps) => (
    <h3
      className="mb-3 mt-8 scroll-mt-24 font-title text-lg font-bold tracking-tight text-white sm:text-xl"
      id={headingId(children)}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: (props: HeadingProps) => <h4 className="mb-2 mt-6 font-title font-bold text-white" {...props} />,
  p: (props: ParagraphProps) => <p className="my-4 leading-relaxed text-zinc-300" {...props} />,
  ol: (props: ListProps) => <ol className="my-4 list-decimal space-y-2 pl-5 text-zinc-300" {...props} />,
  ul: (props: ListProps) => <ul className="my-4 list-disc space-y-2 pl-5 text-zinc-300" {...props} />,
  li: (props: ListItemProps) => <li className="pl-1 leading-relaxed" {...props} />,
  em: (props: ComponentPropsWithoutRef<"em">) => <em className="italic" {...props} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => <strong className="font-semibold text-white" {...props} />,
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
      className="my-6 overflow-x-auto rounded-lg border border-white/10 bg-[#101013] p-4 text-sm leading-relaxed"
      {...props}
    />
  ),
  blockquote: (props: BlockquoteProps) => (
    <blockquote className="my-6 border-l-2 border-yellow-400/60 pl-4 italic text-zinc-400" {...props} />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => <hr className="my-8 border-white/10" {...props} />,
  table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 w-full overflow-x-auto">
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
  tr: ({ children, ...props }: ComponentPropsWithoutRef<"tr">) => <tr {...props}>{stripWhitespaceNodes(children)}</tr>,
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="border-b border-white/20 px-3 py-2 text-left font-semibold text-white" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b border-white/10 px-3 py-2 text-zinc-300" {...props} />
  ),
  // Renders the byline + tags and injects BlogPosting/BreadcrumbList JSON-LD.
  // Usage in a post: `<PostHeader post={post} />` right below the `# title`.
  PostHeader: ({ post }: { post: PostInfo }) => {
    const author = post.author ?? DEFAULT_POST_AUTHOR;

    return (
      <>
        <div className="mb-10 mt-2 flex flex-col gap-3">
          <p className="font-terminal text-sm text-zinc-500">
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            <span> · {author}</span>
          </p>
          {post.tags?.length ? (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  className="rounded-full border border-white/10 px-3 py-1 font-terminal text-xs text-zinc-400 transition-colors hover:border-yellow-400/40 hover:text-yellow-400"
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
