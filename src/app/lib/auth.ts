import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import * as schema from "../../lib/db/schema";
import { ALLOWED_EMAILS, BASE_URL, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } from "./constants";
import { oAuthProxy } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apikey: schema.apikey,
    },
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds (5 minutes)
    },
  },
  user: {
    additionalFields: {
      role: {
        type: ["user", "admin"],
        defaultValue: "user",
        input: false, // Prevent users from setting this themselves
      },
      status: {
        type: ["active", "inactive"],
        defaultValue: "inactive",
        input: false, // Prevent users from setting this themselves
      },
    },
  },
  plugins: [
    oAuthProxy(),
    /**
     * Machine callers (the Owy bot — see /owy) authenticate with an API key
     * sent as `x-api-key`. `enableSessionForAPIKeys` turns a valid key into a
     * normal session for its owning user, so `getSession` and every
     * authorization check downstream work unchanged. Mint keys with
     * `pnpm owy:key`; revoke by disabling or deleting the row.
     */
    apiKey({
      enableSessionForAPIKeys: true,
      // Bots are chatty on event day; the default (10/day) is far too low.
      rateLimit: {
        enabled: true,
        timeWindow: 60 * 1000,
        maxRequests: 240,
      },
    }),
  ],
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // Enforce only when list is populated
      if (ALLOWED_EMAILS.length === 0) return;

      const newSession = ctx.context?.newSession;
      const user = newSession?.user;

      if (!user?.email) return;

      const normalizedEmail = user.email.toLowerCase().trim();
      if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
        // Best-effort cleanup to avoid persisting unauthorized users
        try {
          if (user.id) {
            await db.delete(schema.user).where(eq(schema.user.id, user.id));
          }
        } catch (err) {
          console.error("Failed to delete unauthorized user:", err);
        }

        throw new APIError("FORBIDDEN", {
          message:
            "Access denied: Your email is not authorized to access this application. Please contact an administrator.",
        });
      }
    }),
  },
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  socialProviders: {
    slack: {
      clientId: SLACK_CLIENT_ID,
      clientSecret: SLACK_CLIENT_SECRET,
    },
  },
  trustedOrigins: [BASE_URL],
});

export type Session = typeof auth.$Infer.Session;
