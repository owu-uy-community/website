/*
 * Launch switch for "Lo que la comunidad comparte": the Semanario, the salary survey and
 * the guides (blog posts tagged "guias"). The code ships; the pages stay hidden until
 * NEXT_PUBLIC_FLAG_RECURSOS is "1". It's read at build time so the server and the client
 * agree: set it per environment in Vercel (on for Preview only, say) and redeploy.
 */
export const RESOURCES_ON = ["1", "true"].includes(process.env.NEXT_PUBLIC_FLAG_RECURSOS ?? "");

/** While the flag is off, these paths and everything under them answer 404 (see src/proxy.ts) */
const RESOURCE_PATHS = ["/semanario", "/encuesta-sueldos"];

export const isHiddenPath = (pathname: string) =>
  !RESOURCES_ON && RESOURCE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/** While the flag is off, guides leave the blog index, the feed and the sitemap, and their pages 404 */
export const isHiddenPost = (tags: readonly string[] = []) => !RESOURCES_ON && tags.includes("guias");
