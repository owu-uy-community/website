/**
 * Where to go after signing in: a path on this site, never another origin. "//evil.com" and
 * "/\\evil.com" are protocol-relative in browsers, so they're refused like full URLs.
 */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;

  return next;
}
