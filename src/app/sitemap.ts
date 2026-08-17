import type { MetadataRoute } from "next";

import { getBlogPosts } from "app/(web)/(content)/blog/(posts)/posts";

export const dynamic = "force-static";

const SITE_URL = "https://www.owu.uy";
const CONF_URL = "https://conf.owu.uy";

const MAIN_ROUTES = [
  "",
  "/la-meetup",
  "/la-meetup/interes",
  "/la-meetup/openspace",
  "/la-meetup/sponsors",
  "/2024/la-meetup",
  "/2024/la-meetup/comunidades",
  "/2024/la-meetup/interes",
  "/2024/la-meetup/openspace",
  "/2024/la-meetup/sponsors",
  "/2023/la-meetup",
  "/blog",
];

// conf.owu.uy paths served by this same app (main-host /conf* 308-redirects to the subdomain)
const CONF_ROUTES = ["", "/call-for-proposals", "/sponsors"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getBlogPosts();

  return [
    ...MAIN_ROUTES.map((route) => ({ url: `${SITE_URL}${route}` })),
    ...CONF_ROUTES.map((route) => ({ url: `${CONF_URL}${route}` })),
    ...posts.map((post) => ({ url: `${SITE_URL}/blog/${post.slug}`, lastModified: post.updated ?? post.date })),
  ];
}
