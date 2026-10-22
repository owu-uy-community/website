import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "../../lib/db";
import * as schema from "../../lib/db/schema";
import { sendEmail } from "../../lib/email/send";
import { otpEmail } from "../../lib/email/templates";
import { limiter } from "../../lib/orpc/ratelimit";
import { BASE_URL, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } from "./constants";
import { admin, emailOTP, oAuthProxy } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { platformAc, platformRoles } from "../../lib/authz/catalog";
import { slackTeamOf } from "../../lib/authz/slack";

const TEN_MINUTES = 10 * 60;

/**
 * Better Auth endpoints that stay server-side only: API keys and the admin plugin's people
 * management. The access procedures call them after checking permissions, the escalation rule and
 * the OWU Slack requirement, and write the audit log; over HTTP anyone signed in could mint a key
 * that outlived their session. Impersonation stays reachable (it sets the cookie), behind its
 * permission.
 */
const SERVER_ONLY_PATHS = [
  "/api-key/create",
  "/api-key/update",
  "/api-key/delete",
  "/api-key/list",
  "/api-key/get",
  "/api-key/delete-all-expired-api-keys",
  "/admin/set-role",
  "/admin/create-user",
  "/admin/update-user",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/list-users",
  "/admin/get-user",
  "/admin/list-user-sessions",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
];

/**
 * Sign-in codes, on top of Better Auth's own per-IP window: 3 per mailbox from one network, so a
 * stranger can't use up someone else's; 10 per mailbox overall against mail bombing; 20 per network.
 */
const codesPerEmailAndIp = limiter({ prefix: "otp:email-ip:", maxRequests: 3, window: TEN_MINUTES * 1000 });
const codesPerEmail = limiter({ prefix: "otp:email:", maxRequests: 10, window: TEN_MINUTES * 1000 });
const codesPerIp = limiter({ prefix: "otp:ip:", maxRequests: 20, window: TEN_MINUTES * 1000 });

/** Every route that mails a code. Only sign-in codes go out, but all of them count. */
const SENDS_CODE = new Set([
  "/email-otp/send-verification-otp",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/request-email-change",
]);

// x-real-ip is set by Vercel; x-forwarded-for is the local fallback.
const clientIp = (headers: Headers | undefined) =>
  headers?.get("x-real-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export const auth = betterAuth({
  disabledPaths: SERVER_ONLY_PATHS,
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
  /**
   * Better Auth's own per-IP limit, minus the session read: at a meetup or the conf everyone shares
   * the venue's Wi-Fi, and a limited read made signed-in people look signed out. Sign-in codes keep
   * their limits (the plugin's and ours below).
   */
  rateLimit: { customRules: { "/get-session": false } },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds (5 minutes)
    },
  },
  user: {
    /**
     * Anyone can delete their account (Ley 18.331) from a session started in the last day; an older
     * one signs in again first. Their sign-ups lose who they were before the account goes.
     */
    deleteUser: {
      enabled: true,
      async beforeDelete(user) {
        // Imported here: the oRPC services import this file
        const [{ Effect }, { forget }, { liveServices }, { soleOwnerOf }] = await Promise.all([
          import("effect"),
          import("../../lib/orpc/rsvps/service"),
          import("../../lib/orpc/services"),
          import("../../lib/authz/people"),
        ]);
        // A community whose only owner leaves would be left without anyone able to run it.
        const orphaned = await soleOwnerOf(user.id);
        if (orphaned.length > 0) {
          throw new APIError("BAD_REQUEST", {
            message: `Sos el único owner de ${orphaned.join(", ")}: pasale el rol a alguien más antes de borrar tu cuenta.`,
          });
        }
        await Effect.runPromiseWith(liveServices)(forget(user.id));
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
    },
    additionalFields: {
      slackTeamId: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    // The workspace a Slack account signed in from, kept fresh on every sign-in: holding a role
    // needs the OWU Slack (see src/lib/authz/slack.ts).
    account: {
      create: {
        async before(account) {
          if (account.providerId !== "slack") return;

          return { data: { ...account, slackTeamId: slackTeamOf(account.idToken) } };
        },
      },
      update: {
        async before(account) {
          if (!account.idToken) return;
          const team = slackTeamOf(account.idToken);

          return team ? { data: { ...account, slackTeamId: team } } : undefined;
        },
      },
    },
    // The allowlist: invitations waiting for this person take effect when they sign in.
    session: {
      create: {
        async after(session) {
          const { applyInvitations } = await import("../../lib/authz/people");
          await applyInvitations(session.userId).catch((error: unknown) => {
            console.error("Could not apply invitations on sign-in", error);
          });
        },
      },
    },
  },
  plugins: [
    oAuthProxy(),
    /**
     * Platform roles (user.role, comma-joined), bans and impersonation, checked against the
     * permission catalog in src/lib/authz/catalog.ts. Every privileged role is an "admin role" here,
     * so only `user:impersonate-admins` may view the site as one of them (nobody holds it).
     */
    admin({
      ac: platformAc,
      roles: platformRoles,
      defaultRole: "user",
      adminRoles: ["superadmin", "staff", "moderator", "service"],
      impersonationSessionDuration: 15 * 60,
      bannedUserMessage: "Tu cuenta está suspendida. Escribinos a hola@owu.uy si creés que es un error.",
    }),
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
      async sendVerificationOTP({ email, otp, type }) {
        // There are no passwords to reset or emails to change: only sign-in codes are mailed.
        if (type === "sign-in") await sendEmail({ to: email, ...otpEmail(otp) });
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
      if (!ctx.path || !SENDS_CODE.has(ctx.path)) return;
      const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "")
        .trim()
        .toLowerCase();
      const ip = clientIp(ctx.headers);

      for (const [codes, key] of [
        [codesPerEmailAndIp, `${email}|${ip}`],
        [codesPerEmail, email],
        [codesPerIp, ip],
      ] as const) {
        if (!(await codes.limit(key)).success) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Pediste varios códigos seguidos. Probá de nuevo en unos minutos.",
          });
        }
      }
    }),
    /** Viewing the site as someone else is always on the record: who, as whom, when. */
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/admin/impersonate-user" && ctx.path !== "/admin/stop-impersonating") return;
      // The session the endpoint just started: the impersonation (it names the superadmin), or the
      // superadmin's own again when they stop
      const started = ctx.context.newSession as
        | { user: { id: string }; session: { impersonatedBy?: string | null } }
        | null
        | undefined;
      if (!started) return;
      const starting = ctx.path === "/admin/impersonate-user";
      const { audit } = await import("../../lib/authz/audit");
      await audit(db, {
        actorId: starting ? (started.session.impersonatedBy ?? null) : started.user.id,
        via: "session",
        action: starting ? "user.impersonate" : "user.stop_impersonating",
        targetType: "user",
        targetId: starting ? started.user.id : null,
        ip: clientIp(ctx.headers),
        userAgent: ctx.headers?.get("user-agent") ?? null,
      });
    }),
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
