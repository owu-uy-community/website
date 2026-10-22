import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "./auth";

/**
 * Validates that the user is authenticated and has admin role.
 * Redirects to /login if not authenticated.
 * Redirects anyone else to the admin's front door, which sends community staff to their own day
 * (a shared link to a site-staff page used to drop them on the public home, out of the admin and,
 * installed, out of the app) and everyone else to the site.
 *
 * @returns The validated session with admin user
 */
export async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // If no session, redirect to login
  if (!session) {
    redirect("/login");
  }

  // Check if user has admin role
  if (session.user.role !== "admin") {
    redirect("/admin");
  }

  return session;
}

/**
 * Staff pages (e.g. /admin/tareas): any authenticated user may enter — the
 * real authorization is event resolution (site staff sees every event,
 * community members see their communities' events, everyone else gets an
 * empty list).
 */
export async function requireStaffSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  return session;
}

/** True when the user is site staff (full admin). */
export function isSiteAdmin(session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>): boolean {
  return session.user.role === "admin";
}
