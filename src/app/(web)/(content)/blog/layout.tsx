import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import Footer from "components/shared/Footer";

import { BLOG_DESCRIPTION, ogImageUrl } from "./(posts)/post-metadata";

const BLOG_OG_IMAGE = ogImageUrl({ title: "Blog de OWU" });

export const metadata: Metadata = {
  title: {
    default: "Blog | OWU Uruguay",
    template: "%s | Blog de OWU",
  },
  description: BLOG_DESCRIPTION,
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": "/blog/feed.xml" },
  },
  openGraph: {
    title: "Blog | OWU Uruguay",
    description: BLOG_DESCRIPTION,
    url: "/blog",
    siteName: "OWU Uruguay",
    locale: "es_UY",
    type: "website",
    images: [{ url: BLOG_OG_IMAGE, width: 1200, height: 630, alt: "Blog de OWU" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | OWU Uruguay",
    description: BLOG_DESCRIPTION,
    images: [BLOG_OG_IMAGE],
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <div className="container flex min-h-[calc(100dvh-56px)] w-full flex-col items-center">
        <main className="w-full max-w-5xl grow pb-16 pt-10 sm:pt-14">{children}</main>
        <Footer />
      </div>
    </NuqsAdapter>
  );
}
