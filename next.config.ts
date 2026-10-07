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
  images: {
    domains: ["localhost"],
  },
  outputFileTracingIncludes: {
    "/keystatic/[[...params]]": ["./content/**/*"],
    "/keystatic": ["./content/**/*"],
    "/api/keystatic/[...params]": ["./content/**/*"],
    "/la-meetup": ["./content/**/*"],
    // owyStage.getSpeakers reads the speakers collection through the API routes
    "/api/orpc/[[...rest]]": ["./content/**/*"],
    "/api/v1/[[...rest]]": ["./content/**/*"],
    // Fonts read at runtime by the /blog/og image generator
    "/blog/og": ["./src/app/(web)/(content)/blog/og/*.ttf"],
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
