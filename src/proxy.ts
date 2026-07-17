import { NextRequest, NextResponse } from "next/server";

const CONF_HOST = "conf.owu.uy";
const CONF_URL = "https://conf.owu.uy";
const MAIN_URL = "https://owu.uy";
const MAIN_HOSTS = new Set(["owu.uy", "www.owu.uy"]);

// Pages that exist under /conf; anything else on the subdomain belongs to the main site
const CONF_PATHS = new Set(["/", "/call-for-proposals", "/sponsors"]);

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

  if (pathname.startsWith("/admin")) {
    const sessionCookie =
      request.cookies.get("better-auth.session_token") || request.cookies.get("__Secure-better-auth.session_token");

    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (pathname === "/login" || pathname === "/registro") {
    const sessionCookie =
      request.cookies.get("better-auth.session_token") || request.cookies.get("__Secure-better-auth.session_token");

    if (sessionCookie) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|images|icons|fonts|sounds|robots.txt|sitemap.xml).*)"],
};
