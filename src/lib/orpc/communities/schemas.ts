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
  createdAt: z.string(),
  updatedAt: z.string(),
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

export const UpdateCommunitySchema = z.object({
  communityId: z.string().min(1),
  data: z
    .object({
      name: z.string().min(1),
      description: z.string().nullable(),
      logoUrl: z.url().nullable(),
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

export type Community = z.infer<typeof CommunitySchema>;
export type CommunityMember = z.infer<typeof CommunityMemberSchema>;
export type CommunityRole = z.infer<typeof CommunityRoleSchema>;
