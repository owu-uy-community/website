import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "./auth";

/**
 * Validates that the user is authenticated and has admin role.
 * Redirects to /login if not authenticated.
 * Redirects to / if user is not an admin.
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
  // @ts-expect-error - role is defined in auth config additionalFields,
  // better-auth type definitions are broken for this use case
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return session;
}
