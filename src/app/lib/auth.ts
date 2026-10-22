import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "../../lib/db";
import * as schema from "../../lib/db/schema";
import { sendEmail } from "../../lib/email/send";
import { otpEmail } from "../../lib/email/templates";
import { limiter } from "../../lib/orpc/ratelimit";
import { BASE_URL, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } from "./constants";
import { emailOTP, oAuthProxy } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";

const TEN_MINUTES = 10 * 60;

/** Sign-in codes per mailbox and per network, on top of Better Auth's own per-IP window. */
const codesPerEmail = limiter({ prefix: "otp:email:", maxRequests: 3, window: TEN_MINUTES * 1000 });
const codesPerIp = limiter({ prefix: "otp:ip:", maxRequests: 20, window: TEN_MINUTES * 1000 });

const clientIp = (headers: Headers | undefined) =>
  headers?.get("x-real-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

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
     * People without the OWU Slack sign in with a 6-digit code sent by email. Codes are stored
     * hashed, last 10 minutes and allow 5 tries; a new account starts with an empty name, which
     * the login page asks for right after.
     */
    emailOTP({
      expiresIn: TEN_MINUTES,
      allowedAttempts: 5,
      storeOTP: "hashed",
      rateLimit: { window: 60, max: 10 },
      async sendVerificationOTP({ email, otp }) {
        await sendEmail({ to: email, ...otpEmail(otp) });
      },
    }),
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
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/email-otp/send-verification-otp") return;
      const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "")
        .trim()
        .toLowerCase();

      for (const [codes, key] of [
        [codesPerEmail, email],
        [codesPerIp, clientIp(ctx.headers)],
      ] as const) {
        if (!(await codes.limit(key)).success) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Pediste varios códigos seguidos. Probá de nuevo en unos minutos.",
          });
        }
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
