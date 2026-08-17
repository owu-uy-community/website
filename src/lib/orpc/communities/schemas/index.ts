import { z } from "zod";

import { RESERVED_SLUGS } from "../../../tenant";

export const CommunityRoleSchema = z.enum(["owner", "admin", "editor", "member"]);

export const CommunitySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  customDomain: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ListCommunitiesSchema = z
  .object({
    includeInactive: z.boolean().optional(),
  })
  .optional();

export const GetCommunityBySlugSchema = z.object({
  communitySlug: z.string().min(1),
});

export const CreateCommunitySchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and dashes")
    .refine((slug) => !RESERVED_SLUGS.has(slug), "Ese slug está reservado por el sitio"),
  name: z.string().min(1),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

export const UpdateCommunitySchema = z.object({
  communityId: z.string().min(1),
  data: z
    .object({
      name: z.string().min(1),
      description: z.string().nullable(),
      logoUrl: z.string().url().nullable(),
      isActive: z.boolean(),
    })
    .partial(),
});

export const ListCommunityMembersSchema = z.object({
  communityId: z.string().min(1),
});

export const AddCommunityMemberSchema = z.object({
  communityId: z.string().min(1),
  email: z.string().email(),
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

export type Community = z.infer<typeof CommunitySchema>;
export type CommunityMember = z.infer<typeof CommunityMemberSchema>;
export type ListCommunitiesInput = z.infer<typeof ListCommunitiesSchema>;
export type GetCommunityBySlugInput = z.infer<typeof GetCommunityBySlugSchema>;
export type CreateCommunityInput = z.infer<typeof CreateCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof UpdateCommunitySchema>;
export type ListCommunityMembersInput = z.infer<typeof ListCommunityMembersSchema>;
export type AddCommunityMemberInput = z.infer<typeof AddCommunityMemberSchema>;
export type UpdateCommunityMemberRoleInput = z.infer<typeof UpdateCommunityMemberRoleSchema>;
export type RemoveCommunityMemberInput = z.infer<typeof RemoveCommunityMemberSchema>;
