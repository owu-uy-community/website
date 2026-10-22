const PROBE = "http://next.invalid";

/**
 * Where to go after signing in: a path on this site, never another origin. The value is parsed
 * the way a browser would ("//evil.com", "/\\evil.com" and "/\t/evil.com" all leave the site),
 * and only a path that stays on the probe origin survives.
 */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next?.startsWith("/")) return fallback;
  const url = new URL(next, PROBE);
  if (url.origin !== PROBE) return fallback;

  return url.pathname + url.search + url.hash;
}
