import type { Metadata } from "next";

import { ogImageUrl } from "app/(web)/(content)/blog/(posts)/post-metadata";

/**
 * Metadata for a community page. A page's `openGraph` replaces the root one
 * entirely, so it always carries its own image: the branded generator at /blog/og.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const image = ogImageUrl({ title });

  return {
    title: `${title} | OWU Uruguay`,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "OWU Uruguay",
      locale: "es_UY",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
