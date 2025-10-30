import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "./db";
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
  // @ts-expect-error - crossSubDomainCookies is a valid better-auth option but not in current type definitions
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
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Skip validation if no allowed emails are configured
      if (ALLOWED_EMAILS.length === 0) {
        return;
      }

      // Check for sign-up and sign-in endpoints
      if (ctx.path === "/sign-up/email" || ctx.path === "/sign-in/email" || ctx.path?.includes("/callback")) {
        const email = ctx.body?.email;
        if (!email) {
          return;
        }

        const normalizedEmail = email.toLowerCase().trim();
        if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
          throw new APIError("FORBIDDEN", {
            message:
              "Access denied: Your email is not authorized to access this application. Please contact an administrator.",
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      // Skip validation if no allowed emails are configured
      if (ALLOWED_EMAILS.length === 0) {
        return;
      }

      // Validate email from OAuth callbacks and other sign-in/sign-up flows
      if (ctx.path?.startsWith("/sign-up") || ctx.path?.startsWith("/sign-in")) {
        const newSession = ctx.context.newSession;
        if (newSession?.user?.email) {
          const normalizedEmail = newSession.user.email.toLowerCase().trim();
          if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
            throw new APIError("FORBIDDEN", {
              message:
                "Access denied: Your email is not authorized to access this application. Please contact an administrator.",
            });
          }
        }
      }
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
