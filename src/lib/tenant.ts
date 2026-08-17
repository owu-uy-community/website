/**
 * Tenant (community) resolution helpers shared by routing, slugs validation
 * and the API layer. The public site consumes communities at /comunidad/[slug].
 */

/** Slugs that can never be community slugs (they collide with app routes). */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "c",
  "comunidad",
  "conf",
  "login",
  "registro",
  "openspace",
  "keystatic",
  "la-meetup",
  "la-meetupeada",
  "blog",
  "2023",
  "2024",
  "2025",
  "2026",
  "owu-conf",
  "assets",
  "images",
  "icons",
  "fonts",
  "sounds",
  // Static /admin/* segments — a community with one of these slugs would be
  // shadowed under the community-scoped admin URLs (/admin/<slug>/...).
  "communities",
  "settings",
  "screen",
  "launchpad",
  "tareas",
  "attendees",
]);

export const COMMUNITY_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46})[a-z0-9]$/;

export function isValidCommunitySlug(slug: string): boolean {
  return COMMUNITY_SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** The event every pre-multi-tenant URL and constant pointed at. */
export const LEGACY_EVENT_ID = "default-openspace";
export const LEGACY_COMMUNITY_SLUG = "owu";
export const LEGACY_EVENT_SLUG = "la-meetup-2025";

const LEGACY_EVENT_BASE = `/comunidad/${LEGACY_COMMUNITY_SLUG}/events/${LEGACY_EVENT_SLUG}`;

/** Pre-multi-tenant URLs → their tenant equivalents (308 in proxy.ts). */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/la-meetup/openspace": `${LEGACY_EVENT_BASE}/openspace`,
  "/openspace/kiosk": `${LEGACY_EVENT_BASE}/kiosk`,
  "/openspace/kiosk/map": `${LEGACY_EVENT_BASE}/kiosk/map`,
  "/openspace/stickynote": `${LEGACY_EVENT_BASE}/stickynote`,
  "/openspace/countdown": `${LEGACY_EVENT_BASE}/countdown`,
};
