import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma as db } from "../../lib/prisma";
import {
  ALLOWED_EMAILS,
  BASE_URL,
  DOMAIN,
  IS_PRODUCTION,
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  USE_SECURE_COOKIES,
} from "./constants";
import { oAuthProxy } from "better-auth/plugins";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
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
        type: "string",
        defaultValue: "user",
        input: false, // Prevent users from setting this themselves
      },
      status: {
        type: "string",
        defaultValue: "inactive",
        input: false, // Prevent users from setting this themselves
      },
    },
  },
  plugins: [oAuthProxy()],
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
            await db.user.delete({ where: { id: user.id } });
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
  // @ts-expect-error: 'crossSubDomainCookies' is supported by runtime but not in current types
  crossSubDomainCookies: {
    enabled: true,
    domain: DOMAIN,
  },
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  defaultCookieAttributes: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    partitioned: IS_PRODUCTION,
  },
  useSecureCookies: USE_SECURE_COOKIES,
  socialProviders: {
    slack: {
      clientId: SLACK_CLIENT_ID,
      clientSecret: SLACK_CLIENT_SECRET,
    },
  },
  trustedOrigins: [BASE_URL],
});

export type Session = typeof auth.$Infer.Session;
