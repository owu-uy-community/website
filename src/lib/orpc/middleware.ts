import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "../../app/lib/auth";
import { db } from "../db";
import { communityMembers, type CommunityRoleValue } from "../db/schema";
import { resolveCommunityScope, type CommunityScope } from "./utilities/resolve-community";

export interface Context {
  session?: Session | null;
  user?: Session["user"] | null;
  /** Populated by requireCommunityRole. */
  scope?: CommunityScope;
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

const ROLE_RANK: Record<CommunityRoleValue, number> = {
  member: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function isSiteStaff(user: NonNullable<Context["user"]>): boolean {
  // @ts-expect-error - user.role comes from Better Auth additionalFields; its types don't carry it
  return user.role === "admin";
}

/**
 * Middleware factory: require at least `minimum` role in the community the
 * request input refers to. Attach AFTER `.input(...)` so the validated input
 * is available for scope resolution. Site staff (user.role === "admin")
 * always passes. Services must still filter by the resolved scope — the
 * middleware authorizes, it does not scope queries.
 */
export function requireCommunityRole(minimum: CommunityRoleValue) {
  return async ({ context, next }: { context: Context; next: (opts?: { context?: any }) => any }, input: unknown) => {
    if (!context?.session || !context?.user) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Authentication required",
      });
    }

    const scope = await resolveCommunityScope(input);
    if (!scope) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Could not resolve the community this request refers to",
      });
    }

    if (!isSiteStaff(context.user)) {
      const [membership] = await db
        .select({ role: communityMembers.role })
        .from(communityMembers)
        .where(and(eq(communityMembers.communityId, scope.communityId), eq(communityMembers.userId, context.user.id)));

      if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minimum]) {
        throw new ORPCError("FORBIDDEN", {
          message: `Requires ${minimum} role in this community`,
        });
      }
    }

    return next({ context: { ...context, scope } });
  };
}
