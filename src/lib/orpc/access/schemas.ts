import * as z from "zod";

import { PLATFORM_ROLES, type PlatformRole } from "../../authz/catalog";
import { CommunityRoleSchema } from "../communities/schemas";

export const PlatformRoleSchema = z.enum(PLATFORM_ROLES as [PlatformRole, ...PlatformRole[]]);

/** Permissions as Better Auth stores them: resource → actions. Unknown entries are dropped by the service. */
export const GrantsSchema = z.record(z.string(), z.array(z.string()).max(30));

const SlackUserIdSchema = z.string().regex(/^[UW][A-Z0-9]{6,}$/, "Usuario de Slack inválido");

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------
export const MeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /** Platform roles on record, and which of them count right now. */
  roles: z.array(z.string()),
  countingRoles: z.array(z.string()),
  /** Platform permissions that count ("resource:action"). */
  permissions: z.array(z.string()),
  owuSlack: z.boolean(),
  /** A Slack account from another workspace is linked (roles need the OWU one). */
  otherSlack: z.boolean(),
  telegram: z.boolean(),
  /** Roles need the OWU Slack from this moment (ISO). */
  owuSlackRequiredFrom: z.string(),
  /** Memberships, to know whether anything needs the OWU Slack. */
  communities: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string(), role: z.string() })),
  requests: z.array(
    z.object({
      id: z.string(),
      communityId: z.string().nullable(),
      communityName: z.string().nullable(),
      status: z.string(),
      createdAt: z.string(),
    })
  ),
  /** Someone viewing the site as this person (Better Auth impersonation). */
  impersonatedBy: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Access requests (the waitlist)
// ---------------------------------------------------------------------------
export const RequestAccessSchema = z.object({
  /** A community's team; none: the OWU dashboard itself. */
  communityId: z.string().min(1).nullable().default(null),
  message: z.string().trim().max(1000).default(""),
});

export const AccessRequestSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
  message: z.string(),
  grantedRole: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  community: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    owuSlack: z.boolean(),
  }),
  decidedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});

export const DecideRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  /** On approval: a role in the request's community, or in another one for a dashboard request. */
  grant: z
    .union([
      z.object({ communityId: z.string().min(1), role: CommunityRoleSchema }),
      z.object({ platformRoles: z.array(PlatformRoleSchema).min(1) }),
    ])
    .optional(),
});

// ---------------------------------------------------------------------------
// Invitations (the allowlist)
// ---------------------------------------------------------------------------
export const InvitationSchema = z.object({
  id: z.string(),
  communityId: z.string().nullable(),
  communityName: z.string().nullable(),
  role: z.string(),
  email: z.string().nullable(),
  slackUserId: z.string().nullable(),
  name: z.string().nullable(),
  note: z.string(),
  status: z.enum(["pending", "accepted", "revoked"]),
  invitedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const CreatePlatformInvitationSchema = z
  .object({
    email: z.email().optional(),
    slackUserId: SlackUserIdSchema.optional(),
    name: z.string().trim().max(120).optional(),
    roles: z.array(PlatformRoleSchema).min(1),
    note: z.string().trim().max(300).default(""),
    days: z.number().int().min(1).max(180).default(30),
  })
  .refine((input) => Boolean(input.email || input.slackUserId), "Indicá un email o un usuario de Slack");

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  roles: z.array(z.string()),
  banned: z.boolean(),
  banReason: z.string().nullable(),
  banExpires: z.string().nullable(),
  owuSlack: z.boolean(),
  slack: z.boolean(),
  memberships: z.number(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
});

export const ListPeopleSchema = z.object({
  q: z.string().trim().max(100).default(""),
  /** Only people holding this platform role ("any": any role but user). */
  role: z.union([PlatformRoleSchema, z.literal("any")]).optional(),
  banned: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const PersonDetailSchema = PersonSchema.extend({
  accounts: z.array(z.object({ provider: z.string(), accountId: z.string(), slackTeamId: z.string().nullable() })),
  communities: z.array(
    z.object({ id: z.string(), name: z.string(), slug: z.string(), role: z.string(), since: z.string() })
  ),
  sessions: z.array(
    z.object({
      id: z.string(),
      createdAt: z.string(),
      expiresAt: z.string(),
      ipAddress: z.string().nullable(),
      userAgent: z.string().nullable(),
      impersonatedBy: z.string().nullable(),
    })
  ),
  permissions: z.array(z.string()),
});

export const SetRolesSchema = z.object({ userId: z.string().min(1), roles: z.array(PlatformRoleSchema) });

export const BanSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(3).max(300),
  /** Days until it lifts by itself; none: until someone lifts it. */
  days: z.number().int().min(1).max(3650).optional(),
});

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
export const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(),
  owner: z.object({ id: z.string(), name: z.string() }),
  permissions: z.record(z.string(), z.array(z.string())),
  enabled: z.boolean(),
  expiresAt: z.string().nullable(),
  lastRequest: z.string().nullable(),
  createdAt: z.string(),
});

export const CreateApiKeySchema = z.object({
  /** The service account (machine) it belongs to: an existing one, or a new id. */
  owner: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Un id corto: minúsculas, números y guiones"),
  ownerName: z.string().trim().min(1).max(60).optional(),
  name: z.string().trim().min(1).max(60),
  preset: z.enum(["owy", "owy-operator", "stream-deck", "companion"]).optional(),
  permissions: GrantsSchema.optional(),
  days: z.number().int().min(1).max(730).default(365),
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export const AuditEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  action: z.string(),
  via: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  actor: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }).nullable(),
  by: z.object({ id: z.string(), name: z.string() }).nullable(),
  community: z.object({ id: z.string(), name: z.string() }).nullable(),
  data: z.record(z.string(), z.unknown()),
  ip: z.string().nullable(),
});

export const ListAuditSchema = z.object({
  actorId: z.string().optional(),
  communityId: z.string().optional(),
  /** Matches the start of the action ("user.", "tracks."). */
  action: z.string().trim().max(60).optional(),
  before: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// Checks (the Owy bot) and identities
// ---------------------------------------------------------------------------
export const CheckSchema = z.object({
  permissions: z.array(z.string()).min(1).max(30),
  communityId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
});

/** One of my sessions, as Ajustes lists them (never its token). */
export const MySessionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** The one this request came from. */
  current: z.boolean(),
});

export const LinkTelegramSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{8}$/, "El código son 8 letras y números"),
  telegramUserId: z.string().regex(/^\d{3,20}$/),
});

export type Me = z.infer<typeof MeSchema>;
export type AccessRequest = z.infer<typeof AccessRequestSchema>;
export type Invitation = z.infer<typeof InvitationSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type PersonDetail = z.infer<typeof PersonDetailSchema>;
export type ApiKeyRow = z.infer<typeof ApiKeySchema>;
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
