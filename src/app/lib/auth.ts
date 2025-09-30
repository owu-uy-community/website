import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
import { BASE_URL, DOMAIN, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, USE_SECURE_COOKIES } from "./constants";
import { oAuthProxy } from "better-auth/plugins";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  plugins: [oAuthProxy()],
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
    secure: true,
    httpOnly: true,
    sameSite: "none",
    partitioned: true,
  },
  useSecureCookies: USE_SECURE_COOKIES,
  socialProviders: {
    slack: {
      clientId: SLACK_CLIENT_ID,
      clientSecret: SLACK_CLIENT_SECRET,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
      status: {
        type: "string",
        defaultValue: "inactive",
      },
    },
  },
  trustedOrigins: [BASE_URL],
});

export type Session = typeof auth.$Infer.Session;
