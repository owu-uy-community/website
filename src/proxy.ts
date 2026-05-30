import { NextRequest, NextResponse } from "next/server";

const CONF_HOST = "conf.owu.uy";
const CONF_URL = "https://conf.owu.uy";
const MAIN_HOSTS = new Set(["owu.uy", "www.owu.uy"]);

function getHost(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return host.split(":")[0].toLowerCase();
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = getHost(request);

  if (host === CONF_HOST) {
    const url = request.nextUrl.clone();
    url.pathname = "/conf";
    const response = NextResponse.rewrite(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  if (MAIN_HOSTS.has(host) && (pathname === "/conf" || pathname.startsWith("/conf/"))) {
    return NextResponse.redirect(CONF_URL, 308);
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
