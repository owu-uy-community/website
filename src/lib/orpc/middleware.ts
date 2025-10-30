import { ORPCError } from "@orpc/server";
import type { Session } from "../../app/lib/auth";

export interface Context {
  session?: Session | null;
  user?: Session["user"] | null;
}

/**
 * Middleware to require authentication
 * Throws UNAUTHORIZED if no session exists
 */
export async function requireAuth({ context, next }: { context: Context; next: (opts?: { context?: any }) => any }) {
  if (!context?.session || !context?.user) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Authentication required",
    });
  }

  return next({ context });
}

/**
 * Middleware to require admin role
 * Throws UNAUTHORIZED if not authenticated
 * Throws FORBIDDEN if not an admin
 */
export async function requireAdmin({ context, next }: { context: Context; next: (opts?: { context?: any }) => any }) {
  if (!context?.session || !context?.user) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Authentication required",
    });
  }

  // @ts-expect-error - user.role is a string but better-auth type definitions are broken for this use case
  if (context.user.role !== "admin") {
    throw new ORPCError("FORBIDDEN", {
      message: "Admin access required",
    });
  }

  return next({ context });
}
