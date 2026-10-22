import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "lib/safe-next";

/** Better Auth's cookies, plain and `__Secure-` (HTTPS). */
const COOKIES = ["session_token", "session_data", "dont_remember"].flatMap((name) => [
  `better-auth.${name}`,
  `__Secure-better-auth.${name}`,
]);

/**
 * A session that ended on the server (signed out elsewhere, revoked, suspended) still leaves its
 * cookie in the browser, and the proxy bounces anyone with that cookie away from /login: clear them,
 * then sign in again. `expired` tells the proxy to let this /login through even if a cookie stays.
 */
export function GET(request: NextRequest) {
  const login = new URL("/login", request.url);
  const next = request.nextUrl.searchParams.get("next");
  if (next) login.searchParams.set("next", safeNext(next));
  login.searchParams.set("expired", "1");
  const response = NextResponse.redirect(login);
  for (const name of COOKIES) {
    // Cleared with the attributes it was set with: a browser ignores a `__Secure-` cookie set
    // without Secure, so a plain delete left the session cookie in place (and /admin looping)
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-") || request.nextUrl.protocol === "https:",
    });
  }

  return response;
}
