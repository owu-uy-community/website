import * as z from "zod";

import { TOPICS, type Topic } from "../../community/topics";
import { isValidCommunitySlug } from "../../tenant";
import { ClockSchema, DaySchema, DurationSchema } from "../events/schemas";

/** A built-in role (owner, admin, editor, member, door) or the slug of one of the community's custom roles. */
export const CommunityRoleSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Rol inválido");

/** "Nuestro día": the 2nd Thursday at 19:00 (`nth` -1 is the last one in the month). */
export const RecurringSlotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
  time: ClockSchema,
  durationMin: DurationSchema,
});

export const CommunitySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  customDomain: z.string().nullable(),
  isActive: z.boolean(),
  status: z.enum(["activa", "pausa", "busca-organizadores"]),
  topics: z.array(z.string()),
  links: z.object({
    website: z.string().optional(),
    linkedin: z.string().optional(),
    instagram: z.string().optional(),
    meetup: z.string().optional(),
  }),
  slackChannel: z.string().nullable(),
  listed: z.boolean(),
  recurringSlot: RecurringSlotSchema.nullable(),
  /** Back from a declared pause on this day (status "pausa") */
  pausedUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A community as the admin's list shows it: with how many people and events it has. */
export const CommunityOverviewSchema = CommunitySchema.extend({ memberCount: z.number(), eventCount: z.number() });

export const CommunityMemberSchema = z.object({
  id: z.string(),
  communityId: z.string(),
  userId: z.string(),
  role: CommunityRoleSchema,
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  /** Linked to the OWU Slack: without it their role doesn't count (after the grace period). */
  owuSlack: z.boolean(),
  createdAt: z.string(),
});

export const ListCommunitiesSchema = z
  .object({
    /** Honoured for site staff only; everyone else sees active communities. */
    includeInactive: z.boolean().optional(),
  })
  .optional();

export const GetCommunityBySlugSchema = z.object({ communitySlug: z.string().min(1) });

export const CreateCommunitySchema = z.object({
  slug: z
    .string()
    .refine(isValidCommunitySlug, "Usá 3 a 48 minúsculas, números o guiones; algunos nombres están reservados"),
  name: z.string().min(1),
  description: z.string().optional(),
  logoUrl: z.url().optional(),
});

/** An https URL, or a logo shipped with the site (the directory import stores those paths). */
export const LogoUrlSchema = z.union([
  z.url({ protocol: /^https$/ }),
  z.string().regex(/^\/images\/communities\/[a-z0-9-]+\/[\w.-]+$/, "Usá una URL https"),
]);

const LinkSchema = z.url({ protocol: /^https?$/, error: "Pegá el link completo (https://…)" }).optional();

export const UpdateCommunitySchema = z.object({
  communityId: z.string().min(1),
  data: z
    .object({
      name: z.string().min(1),
      description: z.string().nullable(),
      logoUrl: LogoUrlSchema.nullable(),
      isActive: z.boolean(),
      status: CommunitySchema.shape.status,
      topics: z
        .array(z.enum(TOPICS.map((topic) => topic.value) as [Topic, ...Topic[]]))
        .max(5)
        .transform((topics) => [...new Set(topics)]),
      links: z.object({ website: LinkSchema, linkedin: LinkSchema, instagram: LinkSchema, meetup: LinkSchema }),
      slackChannel: z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/, "El nombre del canal, sin #: minúsculas, números, - o _")
        .nullable(),
      /** A friendly note after someone's second silent no-show (Organizá's Emails tab) */
      noShowNudge: z.boolean(),
      recurringSlot: RecurringSlotSchema.nullable(),
      pausedUntil: DaySchema.nullable(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, "No hay nada para cambiar"),
});

export const CommunityIdSchema = z.object({ communityId: z.string().min(1) });

export const AddCommunityMemberSchema = z
  .object({
    communityId: z.string().min(1),
    email: z.email().optional(),
    /** An OWU Slack member id (U…), from the Slack picker. */
    slackUserId: z
      .string()
      .regex(/^[UW][A-Z0-9]{6,}$/, "Usuario de Slack inválido")
      .optional(),
    /** Their Slack name, from the picker: how the invitation reads until they sign in. */
    name: z.string().trim().max(120).optional(),
    role: CommunityRoleSchema.default("member"),
  })
  .refine((input) => Boolean(input.email || input.slackUserId), "Indicá un email o un usuario de Slack");

export const UpdateCommunityMemberRoleSchema = z.object({
  communityId: z.string().min(1),
  memberId: z.string().min(1),
  role: CommunityRoleSchema,
});

export const RemoveCommunityMemberSchema = z.object({
  communityId: z.string().min(1),
  memberId: z.string().min(1),
});

/** Appear, or not, in «Organizan» on the community's public page (name and photo only) */
export const ShowOnProfileSchema = z.object({ communityId: z.string().min(1), show: z.boolean() });

// ---------------------------------------------------------------------------
// Organizers: the communities I run, and claims on directory communities
// ---------------------------------------------------------------------------
export const ClaimRelationSchema = z.enum(["organizo", "coorganizo", "retomar"]);
export const ClaimStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const ClaimCommunitySchema = z.object({
  communityId: z.string().min(1),
  relation: ClaimRelationSchema,
  message: z.string().trim().max(1000).default(""),
  link: z
    .url({ protocol: /^https?$/ })
    .nullable()
    .default(null),
});

export const MyCommunitySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  role: CommunityRoleSchema,
});

export const MyClaimSchema = z.object({
  id: z.string(),
  communityId: z.string(),
  communityName: z.string(),
  status: ClaimStatusSchema,
  createdAt: z.string(),
});

export const MineSchema = z.object({ communities: z.array(MyCommunitySchema), claims: z.array(MyClaimSchema) });

/** A claim as site staff review it: who asks, for what, and whether the community already has an owner. */
export const ClaimForReviewSchema = z.object({
  id: z.string(),
  relation: ClaimRelationSchema,
  message: z.string(),
  link: z.string().nullable(),
  status: ClaimStatusSchema,
  createdAt: z.string(),
  community: z.object({ id: z.string(), slug: z.string(), name: z.string(), hasOwner: z.boolean() }),
  user: z.object({ id: z.string(), name: z.string(), email: z.string(), image: z.string().nullable() }),
});

export const DecideClaimSchema = z.object({
  claimId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  /** Defaults to owner when the community has none yet, editor otherwise. */
  role: CommunityRoleSchema.optional(),
});

export type Community = z.infer<typeof CommunitySchema>;
export type MyCommunity = z.infer<typeof MyCommunitySchema>;
export type MyClaim = z.infer<typeof MyClaimSchema>;
export type ClaimForReview = z.infer<typeof ClaimForReviewSchema>;
export type CommunityOverview = z.infer<typeof CommunityOverviewSchema>;
export type CommunityMember = z.infer<typeof CommunityMemberSchema>;
export type CommunityRole = z.infer<typeof CommunityRoleSchema>;
