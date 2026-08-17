require("dotenv").config();

const createMDX = require("@next/mdx");

const withMDX = createMDX({});

module.exports = withMDX({
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  reactStrictMode: true,
  images: {
    domains: ["localhost"],
  },
  outputFileTracingIncludes: {
    "/keystatic/[[...params]]": ["./content/**/*"],
    "/keystatic": ["./content/**/*"],
    "/api/keystatic/[...params]": ["./content/**/*"],
    "/la-meetup": ["./content/**/*"],
    // Fonts read at runtime by the /blog/og image generator
    "/blog/og": ["./src/app/(web)/(content)/blog/og/*.ttf"],
  },
  // Rust MDX compiler (Turbopack-native, GFM enabled); remark/rehype plugins are not available with mdxRs.
  experimental: {
    mdxRs: { mdxType: "gfm" },
  },
});
