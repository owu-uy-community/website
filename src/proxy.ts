import { NextRequest, NextResponse } from "next/server";

import { isHiddenPath } from "./lib/community/flags";
import { NOT_FOUND_MARKDOWN } from "./lib/community/markdown";
import { HTML, MARKDOWN, preferredType } from "./lib/negotiate";
import { safeNext } from "./lib/safe-next";
import { LEGACY_REDIRECTS } from "./lib/tenant";

const CONF_HOST = "conf.owu.uy";
const CONF_URL = "https://conf.owu.uy";
const MAIN_URL = "https://owu.uy";
const MAIN_HOSTS = new Set(["owu.uy", "www.owu.uy"]);

// Pages that exist under /conf; anything else on the subdomain belongs to the main site
const CONF_PATHS = new Set(["/", "/call-for-proposals", "/sponsors", "/credencial"]);

/** This site's hosts (the Vercel URLs cover previews): the existence check asks nowhere else */
const SELF_HOSTS = new Set([...MAIN_HOSTS, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean));
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Pages with a Markdown twin, and the route that renders it */
const MARKDOWN_TWINS: Record<string, string> = { "/": "/index.md" };

function getHost(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return host.split(":")[0].toLowerCase();
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = getHost(request);

  if (host === CONF_HOST) {
    // Normalize direct /conf hits on the subdomain to the clean path
    if (pathname === "/conf" || pathname.startsWith("/conf/")) {
      return NextResponse.redirect(new URL(pathname.slice("/conf".length) || "/", CONF_URL), 308);
    }

    // Main-site links (e.g. past meetup editions) must leave the subdomain instead of 404ing under /conf
    if (!CONF_PATHS.has(pathname)) {
      return NextResponse.redirect(new URL(`${pathname}${request.nextUrl.search}`, MAIN_URL), 308);
    }

    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/conf" : `/conf${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (MAIN_HOSTS.has(host) && (pathname === "/conf" || pathname.startsWith("/conf/"))) {
    return NextResponse.redirect(new URL(pathname.slice("/conf".length) || "/", CONF_URL), 308);
  }

  // Features behind the resources launch flag: pages, feeds and downloads answer 404 until it's on.
  // Rewriting to a path no route matches renders the site's own 404 page with a 404 status.
  if (isHiddenPath(pathname)) {
    return pageType(request) === MARKDOWN ? markdownNotFound() : NextResponse.rewrite(new URL("/_hidden", request.url));
  }

  // Community routes moved from /c to /comunidad; keep the short form alive so
  // links shared while it was /c do not dead-end.
  if (pathname === "/c" || pathname.startsWith("/c/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/comunidad${pathname.slice(2)}`;

    return NextResponse.redirect(url, 308);
  }

  // Pre-multi-tenant URLs (kiosk devices, bookmarks) → tenant equivalents
  const legacyTarget = LEGACY_REDIRECTS[pathname];
  if (legacyTarget) {
    return NextResponse.redirect(new URL(`${legacyTarget}${request.nextUrl.search}`, request.url), 308);
  }

  // Cookie-presence bounce only (the proxy cannot query the DB); permission checks
  // live server-side in the admin layout and every page (requirePermission) and in the oRPC middleware.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/keystatic") ||
    pathname.startsWith("/organizar/panel") ||
    pathname === "/acceso"
  ) {
    const sessionCookie =
      request.cookies.get("better-auth.session_token") || request.cookies.get("__Secure-better-auth.session_token");

    if (!sessionCookie) {
      // Back to the page they asked for once they sign in
      const login = new URL("/login", request.url);
      login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);

      return NextResponse.redirect(login);
    }
  }

  if (pathname === "/login" || pathname === "/registro") {
    const sessionCookie =
      request.cookies.get("better-auth.session_token") || request.cookies.get("__Secure-better-auth.session_token");

    // A signed-in visitor has nothing to do here, unless their session just ended on the server
    // (/api/session/expired sends them here): bouncing them back would loop.
    if (sessionCookie && !request.nextUrl.searchParams.has("expired")) {
      return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
    }
  }

  return negotiate(request);
}

/**
 * HTML or Markdown for a page request, per its Accept header (acceptmarkdown.com); null if it takes
 * neither. Undefined when it isn't a page request: RSC fetches, server actions and files (.ics, .xml,
 * .txt) keep their own type.
 */
function pageType(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isFile = pathname.slice(pathname.lastIndexOf("/")).includes(".");
  if (!["GET", "HEAD"].includes(request.method) || request.headers.has("rsc") || isFile) return undefined;

  return preferredType(request.headers.get("accept"), [HTML, MARKDOWN]);
}

/**
 * Pages with a Markdown twin serve it to clients that prefer Markdown, and 406 to those that take
 * neither. A page without one stays HTML (agents still read it); one that doesn't exist answers 404
 * in Markdown. This runs before Vercel's cache, so the HTML and the Markdown never share an entry.
 */
async function negotiate(request: NextRequest) {
  const type = pageType(request);
  if (type === undefined) return NextResponse.next();

  const twin = MARKDOWN_TWINS[request.nextUrl.pathname];
  if (twin) {
    if (type === MARKDOWN) return NextResponse.rewrite(new URL(twin, request.url));
    if (type === null) {
      return new NextResponse("Not Acceptable\n\nThis page is available as:\n- text/html\n- text/markdown\n", {
        status: 406,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", Vary: "Accept" },
      });
    }
  } else if (type === MARKDOWN && (await isMissing(request))) {
    return markdownNotFound();
  }

  return NextResponse.next();
}

/**
 * Whether the page answers 404, asked as a browser would (so this proxy lets it through as HTML).
 * Only ever this site: its own https hosts on Vercel, or this server on loopback when self-hosted
 * (where Next builds the URL from its own hostname and port, not the Host header).
 */
async function isMissing(request: NextRequest) {
  const { origin, protocol, host, hostname, port, pathname, search } = request.nextUrl;
  const isSelf =
    (protocol === "https:" && SELF_HOSTS.has(host)) || (LOOPBACK.has(hostname) && port === process.env.PORT);
  if (!isSelf) return false;

  // The path is set on this site's URL, never resolved against it: resolving "//elsewhere/x" leaves
  // the site, and a page request could make this server call any host.
  const target = new URL(origin);
  target.pathname = pathname;
  target.search = search;
  if (target.origin !== origin) return false;

  try {
    const response = await fetch(target, {
      method: "HEAD",
      headers: { Accept: HTML },
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });

    return response.status === 404;
  } catch {
    return false;
  }
}

function markdownNotFound() {
  return new NextResponse(NOT_FOUND_MARKDOWN, {
    status: 404,
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store", Vary: "Accept" },
  });
}

/**
 * Only where the proxy has something to do. A browser asking owu.uy for a page goes straight to it
 * (and to Vercel's cache) without a hop through here. Matchers must be literals: Next reads them at
 * build time. proxy.test.ts checks that every redirect above is still matched.
 */
export const config = {
  matcher: [
    // conf.owu.uy: its pages map onto /conf, everything else goes to owu.uy
    {
      source:
        "/((?!api|monitoring|_next/static|_next/image|favicon.ico|images|icons|fonts|sounds|robots.txt|sitemap.xml).*)",
      has: [{ type: "host", value: "conf\\.owu\\.uy" }],
    },
    // Agents asking for Markdown, on any page
    {
      source:
        "/((?!api|monitoring|_next/static|_next/image|favicon.ico|images|icons|fonts|sounds|robots.txt|sitemap.xml).*)",
      has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }],
    },
    // The home page (it has a Markdown twin) for clients that take no HTML: they get a 406
    { source: "/", missing: [{ type: "header", key: "accept", value: ".*(text/html|text/\\*|\\*/\\*).*" }] },
    // owu.uy/conf → conf.owu.uy, /c → /comunidad and the pre-multi-tenant URLs (LEGACY_REDIRECTS)
    "/conf/:path*",
    "/c/:path*",
    "/la-meetup/openspace",
    "/openspace/:path*",
    "/2024/la-meetup/comunidades",
    // Behind the resources launch flag (isHiddenPath)
    "/semanario/:path*",
    "/encuesta-sueldos/:path*",
    // Sign-in bounces
    "/admin/:path*",
    "/keystatic/:path*",
    "/organizar/panel/:path*",
    "/acceso",
    "/login",
    "/registro",
  ],
};
