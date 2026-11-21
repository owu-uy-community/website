import { cacheLife } from "next/cache";
import { Newspaper, Rss } from "lucide-react";
import { Suspense } from "react";

import { SOCIAL_LINKS } from "app/lib/constants";
import { buttonClassName, ButtonLink, Container, PageHeader } from "components/community/ui";

import { BLOG_DESCRIPTION, BLOG_NAME, PUBLISHER_LOGO, SITE_URL, serializeJsonLd } from "./(posts)/post-metadata";
import { collectTags, getBlogPosts, type BlogPost } from "./(posts)/posts";
import EmptyState from "./components/EmptyState";
import PostsExplorer from "./components/PostsExplorer";
import PostsGrid from "./components/PostsGrid";
import SearchField from "./components/SearchField";
import TagChips from "./components/TagChips";

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
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <SearchField />
        <TagChips tags={tags} />
      </div>
      <PostsGrid posts={posts} />
    </div>
  );
}

export default async function BlogPage() {
  "use cache";
  // The posts ship with the deploy, and their files only exist at build: a year, so it never regenerates
  // between deploys (the way `dynamic = "force-static"` behaved)
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const posts = await getBlogPosts();
  const tags = collectTags(posts);

  return (
    <>
      <PageHeader
        actions={
          // A route handler, not a page: a plain link so the browser opens the XML
          <a className={buttonClassName("secondary", "sm")} href="/blog/feed.xml">
            <Rss aria-hidden className="size-3.5" />
            RSS
          </a>
        }
        description="Guías para empezar y para crecer, recaps de meetups y novedades de la comunidad. Escritas por gente de OWU."
        eyebrow="Blog"
        title="Lo que aprendemos, por escrito"
      />
      <Container className="py-12 sm:py-16">
        {posts.length === 0 ? (
          <EmptyState
            description="Muy pronto vas a encontrar recaps de meetups, novedades de OWU CONF e historias de la comunidad."
            icon={Newspaper}
            title="Todavía no hay posts"
          >
            <ButtonLink arrow href={SOCIAL_LINKS.slack} size="sm" utm="blog-vacio" variant="secondary">
              Mientras tanto, sumate al Slack
            </ButtonLink>
          </EmptyState>
        ) : (
          <Suspense fallback={<PostsFallback posts={posts} tags={tags} />}>
            <PostsExplorer posts={posts} tags={tags} />
          </Suspense>
        )}
      </Container>
      <script dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogJsonLd(posts)) }} type="application/ld+json" />
    </>
  );
}
