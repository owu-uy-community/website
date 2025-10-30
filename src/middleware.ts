import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes - check for session cookie only
  // Full admin role verification happens server-side on each admin page
  if (pathname.startsWith("/admin")) {
    const sessionCookie =
      request.cookies.get("better-auth.session_token") || request.cookies.get("__Secure-better-auth.session_token");

    // Redirect to login if not authenticated
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Note: Role verification happens server-side in admin pages
    // We can't verify the role here without database access (Edge Runtime limitation)
  }

  // Redirect authenticated users away from login/register pages
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
  matcher: ["/admin/:path*", "/login", "/registro"],
};
