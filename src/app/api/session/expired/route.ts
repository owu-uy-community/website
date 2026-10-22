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
 * then sign in again.
 */
export function GET(request: NextRequest) {
  const login = new URL("/login", request.url);
  const next = request.nextUrl.searchParams.get("next");
  if (next) login.searchParams.set("next", safeNext(next));
  const response = NextResponse.redirect(login);
  for (const name of COOKIES) response.cookies.delete(name);

  return response;
}
