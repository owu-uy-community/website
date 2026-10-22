import { NextRequest, NextResponse } from "next/server";

import { isHiddenPath } from "./lib/community/flags";
import { safeNext } from "./lib/safe-next";
import { LEGACY_REDIRECTS } from "./lib/tenant";

const CONF_HOST = "conf.owu.uy";
const CONF_URL = "https://conf.owu.uy";
const MAIN_URL = "https://owu.uy";
const MAIN_HOSTS = new Set(["owu.uy", "www.owu.uy"]);

// Pages that exist under /conf; anything else on the subdomain belongs to the main site
const CONF_PATHS = new Set(["/", "/call-for-proposals", "/sponsors", "/credencial"]);

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
    return NextResponse.rewrite(new URL("/_hidden", request.url));
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

    if (sessionCookie) {
      return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|monitoring|_next/static|_next/image|favicon.ico|images|icons|fonts|sounds|robots.txt|sitemap.xml).*)",
  ],
};
