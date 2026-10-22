import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import { Effect } from "effect";
import * as z from "zod";

import { authed, platform, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import {
  AccessRequestSchema,
  ApiKeySchema,
  AuditEntrySchema,
  BanSchema,
  CheckSchema,
  CreateApiKeySchema,
  CreatePlatformInvitationSchema,
  DecideRequestSchema,
  InvitationSchema,
  LinkTelegramSchema,
  ListAuditSchema,
  ListPeopleSchema,
  MeSchema,
  MySessionSchema,
  PersonDetailSchema,
  PersonSchema,
  PlatformRoleSchema,
  RequestAccessSchema,
  SetRolesSchema,
} from "./schemas";
import * as Access from "./service";

const docs = (summary: string) => openapi({ tags: ["Access"], summary });

const Ok = z.object({ success: z.literal(true) });

/** Five requests a day per person stops a script; a real person asks once or twice. */
const requestLimit = ratelimit({
  limiter: limiter({ prefix: "access-request:", maxRequests: 5, window: 86_400_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

/**
 * People and access: who holds which role, the waitlist (access requests), the allowlist
 * (invitations), bans and sessions, machines' API keys and the audit log. Every permission lives in
 * src/lib/authz/catalog.ts.
 */
export const accessRouter = {
  me: authed
    .meta(docs("My roles, permissions, linked accounts and access requests"))
    .output(MeSchema)
    .effect(function* () {
      return yield* Access.me();
    }),

  /** Which of a list of permissions the caller holds (for the Owy bot: the person it acts for). */
  check: authed
    .meta(docs("Which of these permissions the caller holds, on the platform or in a community/event"))
    .input(CheckSchema)
    .output(
      z.object({
        actor: z.object({ id: z.string(), name: z.string(), via: z.string(), roles: z.array(z.string()) }),
        allowed: z.record(z.string(), z.boolean()),
      })
    )
    .effect(function* ({ input }) {
      return yield* Access.check(input);
    }),

  request: authed
    .meta(docs("Ask for access to the dashboard or to a community's team"))
    .input(RequestAccessSchema)
    .use(requestLimit)
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Access.requestAccess(input);
    }),

  cancelRequest: authed
    .meta(docs("Withdraw my pending access request"))
    .input(z.object({ requestId: z.string().min(1) }))
    .output(Ok)
    .effect(function* ({ input }) {
      return yield* Access.cancelRequest(input.requestId);
    }),

  /** OWU Slack members by name, for "invite by Slack" pickers. */
  slackMembers: authed
    .meta(docs("Search the OWU Slack's members by name (to invite them)"))
    .input(z.object({ q: z.string().trim().max(60) }))
    .output(z.array(z.object({ id: z.string(), name: z.string(), title: z.string(), image: z.string().nullable() })))
    .effect(function* ({ input }) {
      return yield* Access.searchSlack(input.q);
    }),

  requests: {
    list: platform("claim:read")
      .meta(docs("Every access request, pending first"))
      .input(z.object({ status: AccessRequestSchema.shape.status.optional() }).default({}))
      .output(z.array(AccessRequestSchema))
      .effect(function* ({ input }) {
        return yield* Access.listRequests({ status: input.status });
      }),

    decide: platform("claim:decide")
      .meta(docs("Approve (granting a role) or reject an access request"))
      .input(DecideRequestSchema)
      .output(
        z.object({
          id: z.string(),
          status: z.enum(["approved", "rejected"]),
          grantedRole: z.string().nullable(),
          invited: z.boolean(),
        })
      )
      .effect(function* ({ input }) {
        return yield* Access.decideRequest(input);
      }),
  },

  invitations: {
    list: platform("claim:read")
      .meta(docs("Pending invitations: platform roles and every community's"))
      .input(z.object({ scope: z.enum(["all", "platform"]).default("all") }).default({ scope: "all" }))
      .output(z.array(InvitationSchema))
      .effect(function* ({ input }) {
        return yield* Access.listInvitations({ communityId: input.scope === "platform" ? null : undefined });
      }),

    create: platform("user:set-role")
      .meta(docs("Pre-grant platform roles to an email or OWU Slack member (applies when they sign in)"))
      .input(CreatePlatformInvitationSchema)
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* Access.createPlatformInvitation(input);
      }),

    revoke: platform("invitation:cancel")
      .meta(docs("Cancel a pending invitation"))
      .input(z.object({ invitationId: z.string().min(1) }))
      .output(Ok)
      .effect(function* ({ input }) {
        return yield* Access.revokeInvitation({ invitationId: input.invitationId });
      }),
  },

  users: {
    list: platform("user:list")
      .meta(docs("People, with their platform roles, OWU Slack link and last activity"))
      .input(ListPeopleSchema)
      .output(z.object({ total: z.number(), people: z.array(PersonSchema) }))
      .effect(function* ({ input }) {
        return yield* Access.listPeople(input);
      }),

    get: platform("user:get")
      .meta(docs("One person: roles, accounts, communities, sessions"))
      .input(z.object({ userId: z.string().min(1) }))
      .output(PersonDetailSchema)
      .effect(function* ({ input }) {
        return yield* Access.getPerson(input.userId);
      }),

    setRoles: platform("user:set-role")
      .meta(docs("Set someone's platform roles"))
      .input(SetRolesSchema)
      .output(z.object({ roles: z.array(PlatformRoleSchema) }))
      .effect(function* ({ input }) {
        return yield* Access.setRoles(input);
      }),

    ban: platform("user:ban")
      .meta(docs("Suspend someone: no sign-in, sessions and keys stop working"))
      .input(BanSchema)
      .output(Ok)
      .effect(function* ({ input }) {
        return yield* Access.ban(input);
      }),

    unban: platform("user:ban")
      .meta(docs("Lift a suspension"))
      .input(z.object({ userId: z.string().min(1) }))
      .output(Ok)
      .effect(function* ({ input }) {
        return yield* Access.unban(input.userId);
      }),

    revokeSessions: platform("session:revoke")
      .meta(docs("Sign someone out: one session, or everywhere"))
      .input(z.object({ userId: z.string().min(1), sessionId: z.string().min(1).optional() }))
      .output(z.object({ revoked: z.number() }))
      .effect(function* ({ input }) {
        return yield* Access.revokeSessions(input);
      }),
  },

  apiKeys: {
    list: platform("apiKey:read")
      .meta(docs("Machines' API keys: owner, permissions, expiry, last use"))
      .output(z.array(ApiKeySchema))
      .effect(function* () {
        return yield* Access.listApiKeys();
      }),

    create: platform("apiKey:create")
      .meta(docs("Mint a key for a service account; the key is returned once"))
      .input(CreateApiKeySchema)
      .output(z.object({ id: z.string(), key: z.string(), expiresAt: z.string().nullable() }))
      .effect(function* ({ input }) {
        return yield* Access.createApiKey(input);
      }),

    revoke: platform("apiKey:revoke")
      .meta(docs("Revoke a key: it stops working right away"))
      .input(z.object({ keyId: z.string().min(1) }))
      .output(Ok)
      .effect(function* ({ input }) {
        return yield* Access.revokeApiKey(input.keyId);
      }),
  },

  audit: platform("audit:read")
    .meta(docs("The audit log, newest first"))
    .input(ListAuditSchema)
    .output(z.array(AuditEntrySchema))
    .effect(function* ({ input }) {
      return yield* Access.listAudit(input);
    }),

  /** Where I'm signed in, and closing the others (Ajustes → Sesiones). */
  sessions: {
    list: authed
      .meta(docs("My active sessions (devices), the current one marked"))
      .output(z.array(MySessionSchema))
      .effect(function* ({ context }) {
        const current = yield* Effect.promise(() => context.getSession());

        return yield* Access.mySessions(current?.session.id ?? null);
      }),

    revoke: authed
      .meta(docs("Sign me out of one other session, or of all the others"))
      .input(z.object({ sessionId: z.string().min(1).optional() }).default({}))
      .output(z.object({ revoked: z.number() }))
      .effect(function* ({ input, context }) {
        const current = yield* Effect.promise(() => context.getSession());

        return yield* Access.revokeMySessions({ sessionId: input.sessionId, currentId: current?.session.id ?? null });
      }),
  },

  telegram: {
    code: authed
      .meta(docs("A one-time code to link my Telegram (send it to the bot: /vincular <código>)"))
      .output(z.object({ code: z.string(), expiresAt: z.string() }))
      .effect(function* () {
        return yield* Access.telegramCode();
      }),

    link: platform("delegation:act-as")
      .meta(docs("The bot links the Telegram account a code came from to whoever made the code"))
      .input(LinkTelegramSchema)
      .output(z.object({ name: z.string() }))
      .effect(function* ({ input }) {
        return yield* Access.linkTelegram(input);
      }),

    unlink: authed
      .meta(docs("Unlink my Telegram"))
      .output(Ok)
      .effect(function* () {
        return yield* Access.unlinkTelegram();
      }),
  },
};
