import { Newspaper } from "lucide-react";
import { Suspense } from "react";

import SectionHeading from "components/Landing/SectionHeading";
import { addUtmParams } from "app/lib/utils";
import { SOCIAL_LINKS } from "app/lib/constants";

import { BLOG_DESCRIPTION, BLOG_NAME, PUBLISHER_LOGO, SITE_URL, serializeJsonLd } from "./(posts)/post-metadata";
import { collectTags, getBlogPosts, type BlogPost } from "./(posts)/posts";
import EmptyState, { emptyStateActionClassName } from "./components/EmptyState";
import PostsExplorer from "./components/PostsExplorer";
import PostsGrid from "./components/PostsGrid";
import SearchField from "./components/SearchField";
import TagChips from "./components/TagChips";

export const dynamic = "force-static";

function blogJsonLd(posts: BlogPost[]) {
  const organization = {
    "@type": "Organization",
    name: "OWU — Open Web Uruguay",
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: PUBLISHER_LOGO },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": `${SITE_URL}/blog`,
        name: BLOG_NAME,
        description: BLOG_DESCRIPTION,
        url: `${SITE_URL}/blog`,
        inLanguage: "es",
        publisher: organization,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        ],
      },
      ...(posts.length > 0
        ? [
            {
              "@type": "ItemList",
              itemListElement: posts.map((post, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: post.title,
                url: `${SITE_URL}/blog/${post.slug}`,
              })),
            },
          ]
        : []),
    ],
  };
}

// Server-rendered fallback while the nuqs-powered explorer hydrates (Suspense is
// required around useQueryState on statically generated pages). Chips render as
// plain links here so tag URLs stay crawlable and usable without JS.
function PostsFallback({ posts, tags }: { posts: BlogPost[]; tags: string[] }) {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <SearchField />
      <TagChips tags={tags} />
      <div className="flex w-full flex-col gap-6 pt-2">
        <PostsGrid posts={posts} />
      </div>
    </div>
  );
}

export default async function BlogPage() {
  const posts = await getBlogPosts();
  const tags = collectTags(posts);

  return (
    <div className="flex w-full flex-col items-center gap-10 sm:gap-12">
      <SectionHeading as="h1" subtitle="Historias, aprendizajes y novedades de la comunidad" title="Blog" />
      {posts.length === 0 ? (
        <EmptyState
          description="Muy pronto vas a encontrar recaps de meetups, novedades de OWU CONF e historias de la comunidad."
          icon={Newspaper}
          title="Todavía no hay posts"
        >
          <a
            className={emptyStateActionClassName}
            href={addUtmParams(SOCIAL_LINKS.slack)}
            rel="noopener"
            target="_blank"
          >
            Mientras tanto, sumate al Slack
          </a>
        </EmptyState>
      ) : (
        <Suspense fallback={<PostsFallback posts={posts} tags={tags} />}>
          <PostsExplorer posts={posts} tags={tags} />
        </Suspense>
      )}
      <script dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogJsonLd(posts)) }} type="application/ld+json" />
    </div>
  );
}
