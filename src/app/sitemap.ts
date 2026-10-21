import type { MetadataRoute } from "next";

import { getBlogPosts } from "app/(web)/(content)/blog/(posts)/posts";
import { CONF_URL, PUBLIC_ROUTES, SITE_URL } from "lib/community/site";

export const dynamic = "force-static";

// Past editions' archives, which aren't in the site navigation
const ARCHIVE_ROUTES = [
  "/la-meetup",
  "/la-meetup/interes",
  "/la-meetup/sponsors",
  "/2024/la-meetup",
  "/2024/la-meetup/interes",
  "/2024/la-meetup/openspace",
  "/2024/la-meetup/sponsors",
  "/2023/la-meetup",
];

// conf.owu.uy paths served by this same app (main-host /conf* 308-redirects to the subdomain)
const CONF_ROUTES = ["", "/call-for-proposals", "/sponsors"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getBlogPosts();
  const mainRoutes = [...new Set([...PUBLIC_ROUTES.map((page) => page.href), ...ARCHIVE_ROUTES])];

  return [
    ...mainRoutes.map((route) => ({ url: `${SITE_URL}${route === "/" ? "" : route}` })),
    ...CONF_ROUTES.map((route) => ({ url: `${CONF_URL}${route}` })),
    ...posts.map((post) => ({ url: `${SITE_URL}/blog/${post.slug}`, lastModified: post.updated ?? post.date })),
  ];
}
