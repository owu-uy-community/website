require("dotenv").config();

module.exports = {
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
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    return config;
  },
};
