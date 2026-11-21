import "server-only";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { type Permission } from "lib/authz/catalog";
import { can, canSomewhere, principalFor, type Principal } from "lib/authz/principal";

import { auth } from "./auth";

/**
 * The session behind a request, read past Better Auth's cookie cache: a revoked session, a ban or a
 * role taken away counts on the very next request.
 */
export const sessionFor = (requestHeaders: Headers) =>
  auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } }).catch(() => null);

/** Who is calling a route handler, as the permission checks see them. */
export const principalFromRequest = async (requestHeaders: Headers): Promise<Principal | null> =>
  principalFor(await sessionFor(requestHeaders), requestHeaders);

/** Who is rendering this page; one lookup per request. */
export const currentPrincipal = cache(async (): Promise<Principal | null> => principalFromRequest(await headers()));

/** The session of the page being rendered, fresh (see sessionFor). */
export const currentSession = cache(async () => sessionFor(await headers()));

/**
 * Off to sign in, and back to `next` afterwards. A cookie whose session ended on the server
 * (revoked, suspended) is cleared first: the proxy bounces anyone with that cookie away from /login,
 * straight back here.
 */
export async function signInAgain(next?: string): Promise<never> {
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  const stale = (await cookies()).getAll().some((cookie) => cookie.name.endsWith("better-auth.session_token"));

  redirect(stale ? `/api/session/expired${query}` : `/login${query}`);
}

/** Signed in, or off to the login page (and back here afterwards, when `next` is given). */
export async function requireSignedIn(next?: string) {
  const [session, principal] = await Promise.all([currentSession(), currentPrincipal()]);
  if (!session || !principal || principal.banned) return signInAgain(next);

  return { session, principal };
}

/**
 * The page needs `permission`: on the platform, or in `communityId` when given. Anyone signed in
 * without it goes to the admin's front door (which sends community staff to their own day and
 * everyone else to the site), or gets a 404 when `hide` says the page shouldn't even be known.
 */
export async function requirePermission(
  permission: Permission,
  options: { communityId?: string | null; hide?: boolean } = {}
) {
  const signedIn = await requireSignedIn();
  if (!(await can(signedIn.principal, permission, options.communityId))) {
    if (options.hide) notFound();
    redirect("/admin");
  }

  return signedIn;
}

/** True when the page's viewer holds `permission` (in `communityId`, when given). */
export const hasPermission = async (permission: Permission, communityId?: string | null) =>
  can(await currentPrincipal(), permission, communityId);

/**
 * The dashboard's front door: anyone with a platform role or any community role. Everyone else is
 * offered to ask for access (the waitlist).
 */
export async function requireDashboardAccess() {
  const signedIn = await requireSignedIn("/admin");
  const { principal } = signedIn;
  const access = principal.roles.some((role) => role !== "user") || (await canSomewhere(principal, "event:list"));
  if (!access) redirect("/acceso");

  return signedIn;
}
