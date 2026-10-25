import { and, eq, exists, ne, not, or } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

import { getBlogPosts } from "app/(web)/(content)/blog/(posts)/posts";
import { CONF_URL, PUBLIC_ROUTES, SITE_URL } from "lib/community/site";
import { db } from "lib/db";
import { communities, events, schedules } from "lib/db/schema";
import { eventPagePath } from "lib/revalidate";
import { getTimeline } from "lib/timeline/data";
import { getPhotoCommunities } from "lib/timeline/photos";

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
const CONF_ROUTES = ["", "/call-for-proposals", "/sponsors", "/openspace"];

/**
 * Every listed community's profile and its events' pages. An open-door event with a board
 * redirects to it, so it's left out. Without a database (a build without one) there are none.
 */
async function communityPages(): Promise<MetadataRoute.Sitemap> {
  try {
    const listed = and(eq(communities.listed, true), eq(communities.isActive, true));
    const [profiles, pages] = await Promise.all([
      db.select({ slug: communities.slug, updatedAt: communities.updatedAt }).from(communities).where(listed),
      db
        .select({ community: communities.slug, slug: events.slug, updatedAt: events.updatedAt })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(
          and(
            listed,
            eq(events.status, "published"),
            eq(events.isActive, true),
            or(
              ne(events.registration, "none"),
              not(exists(db.select().from(schedules).where(eq(schedules.openSpaceId, events.id))))
            )
          )
        ),
    ]);

    return [
      ...profiles.map((row) => ({ url: `${SITE_URL}/comunidad/${row.slug}`, lastModified: row.updatedAt })),
      ...pages.map((row) => ({
        url: `${SITE_URL}${eventPagePath(row.community, row.slug)}`,
        lastModified: row.updatedAt,
      })),
    ];
  } catch (error) {
    console.error("[sitemap] no community pages", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  // Rebuilt hourly: community profiles and event pages come from the database
  cacheLife("hours");

  const [posts, community] = await Promise.all([getBlogPosts(), communityPages()]);
  const mainRoutes = [...new Set([...PUBLIC_ROUTES.map((page) => page.href), ...ARCHIVE_ROUTES])];

  return [
    ...mainRoutes.map((route) => ({ url: `${SITE_URL}${route === "/" ? "" : route}` })),
    ...CONF_ROUTES.map((route) => ({ url: `${CONF_URL}${route}` })),
    ...posts.map((post) => ({ url: `${SITE_URL}/blog/${post.slug}`, lastModified: post.updated ?? post.date })),
    ...community,
    // Every event of the history, past ones included
    ...getTimeline().events.map((event) => ({ url: `${SITE_URL}/timeline/${event.slug}` })),
    // Each community's photos in one place
    { url: `${SITE_URL}/timeline/fotos` },
    ...getPhotoCommunities().map(({ slug }) => ({ url: `${SITE_URL}/timeline/fotos/${slug}` })),
  ];
}
