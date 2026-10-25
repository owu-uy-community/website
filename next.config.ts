import "dotenv/config";

import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const withMDX = createMDX({});

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  reactStrictMode: true,
  // Allow hitting the dev server via 127.0.0.1 (separate cookie jar from localhost)
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  // Cache Components: data is fetched per request unless a page or function says "use cache" (with
  // its cacheLife), and every route ships a prerendered static shell that request-time parts stream
  // into. Partial Prefetching: links prefetch one App Shell per route instead of one per link.
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // AVIF first (~20% smaller than WebP) for browsers that take it
    formats: ["image/avif", "image/webp"],
    // Images under /public keep their file names, so an optimized copy can live a month
    // (replace a photo under a new name to refresh it)
    minimumCacheTTL: 2_678_400,
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      // /timeline photos stay where they are published; these sources only come in one size, so
      // they're resized here (Flickr serves its own sizes and skips the optimizer)
      { protocol: "https", hostname: "**.meetupstatic.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "web.archive.org", pathname: "/web/**" },
      { protocol: "https", hostname: "wiki.flisol.uy" },
      // Only for a page's largest photo (AVIF instead of Flickr's JPEG)
      { protocol: "https", hostname: "live.staticflickr.com" },
    ],
  },
  // The English paths people and agents guess, to the Spanish pages that answer them
  async redirects() {
    return [
      { source: "/contact", destination: "/contacto", permanent: true },
      { source: "/privacy", destination: "/privacidad", permanent: true },
    ];
  },
  outputFileTracingIncludes: {
    // Every community page reads Keystatic content when it revalidates (the navbar's
    // ⌘K index too), so all routes carry the content folder (~400 KB of YAML/Markdown)
    "/**": ["./content/**/*"],
    "/keystatic/[[...params]]": ["./content/**/*"],
    "/keystatic": ["./content/**/*"],
    "/api/keystatic/[...params]": ["./content/**/*"],
    "/la-meetup": ["./content/**/*"],
    // Event covers render on demand with OWU's cover fonts and logo (lib/og/cover), the site's image too
    "/comunidad/[communitySlug]/events/[eventSlug]/opengraph-image": [
      "./src/app/(web)/(content)/blog/og/*.ttf",
      "./src/app/(web)/(content)/charlas/og/owu-logo.png",
    ],
    "/opengraph-image": [
      "./src/app/(web)/(content)/blog/og/*.ttf",
      "./src/app/(web)/(content)/charlas/og/owu-logo.png",
    ],
    // owyStage.getSpeakers reads the speakers collection through the API routes
    "/api/orpc/[[...rest]]": ["./content/**/*"],
    "/api/v1/[[...rest]]": ["./content/**/*"],
    // Fonts read at runtime by the /blog/og image generator
    "/blog/og": ["./src/app/(web)/(content)/blog/og/*.ttf"],
    // Talk covers: the blog's Poppins and the OWU logo (built at deploy, traced in case one renders later)
    "/charlas/og/[slug]": [
      "./src/app/(web)/(content)/blog/og/*.ttf",
      "./src/app/(web)/(content)/charlas/og/owu-logo.png",
    ],
    // OWU CONF share images: their own font and strap logo, the blog's Poppins, the badge logo
    "/api/conf/og": [
      "./src/app/api/conf/og/*.{ttf,png}",
      "./src/app/(web)/(content)/blog/og/*.ttf",
      "./public/images/conf/logo-sticker.svg",
      "./public/fonts/permanent-marker.ttf",
    ],
  },
  // Rust MDX compiler (Turbopack-native, GFM enabled); remark/rehype plugins are not available with mdxRs.
  experimental: {
    mdxRs: { mdxType: "gfm" },
  },
};

export default withSentryConfig(withMDX(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Source maps upload only when a token is configured (Vercel builds); local builds skip it.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  // Browser events go through our own origin, so ad blockers don't drop them.
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  telemetry: false,
});
