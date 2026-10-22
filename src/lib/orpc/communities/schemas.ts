import * as z from "zod";

import { isValidCommunitySlug } from "../../tenant";

export const CommunityRoleSchema = z.enum(["owner", "admin", "editor", "member"]);

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
  listed: z.boolean(),
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

export const UpdateCommunitySchema = z.object({
  communityId: z.string().min(1),
  data: z
    .object({
      name: z.string().min(1),
      description: z.string().nullable(),
      logoUrl: LogoUrlSchema.nullable(),
      isActive: z.boolean(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, "No hay nada para cambiar"),
});

export const CommunityIdSchema = z.object({ communityId: z.string().min(1) });

export const AddCommunityMemberSchema = z.object({
  communityId: z.string().min(1),
  email: z.email(),
  role: CommunityRoleSchema.default("member"),
});

export const UpdateCommunityMemberRoleSchema = z.object({
  communityId: z.string().min(1),
  memberId: z.string().min(1),
  role: CommunityRoleSchema,
});

export const RemoveCommunityMemberSchema = z.object({
  communityId: z.string().min(1),
  memberId: z.string().min(1),
});

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
