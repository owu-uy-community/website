import { z } from "zod";

/**
 * Core OpenSpace schema with all fields
 */
export const OpenSpaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean().default(true),
  autoHighlightEnabled: z.boolean().default(false),
  communityId: z.string(),
  slug: z.string(),
  timezone: z.string().optional(),
  eventbriteEventId: z.string().nullable().optional(),
  venueMapUrl: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/**
 * Schema for creating a new open space (omits auto-generated fields).
 * slug is derived from the name when not provided.
 */
export const CreateOpenSpaceSchema = OpenSpaceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and dashes")
    .optional(),
});

/**
 * Schema for updating an open space (all fields optional except constraints).
 * communityId is immutable after creation.
 */
export const UpdateOpenSpaceSchema = CreateOpenSpaceSchema.omit({ communityId: true }).partial();

/**
 * Schema for getting an open space by ID
 */
export const GetOpenSpaceSchema = z.object({
  id: z.string().min(1, "OpenSpace ID is required"),
});

/**
 * Schema for listing a community's events
 */
export const ListOpenSpacesByCommunitySchema = z.object({
  communityId: z.string().min(1, "Community ID is required"),
});

/**
 * Schema for deleting an open space by ID
 */
export const DeleteOpenSpaceSchema = z.object({
  id: z.string().min(1, "OpenSpace ID is required"),
});

/**
 * Schema for updating an open space with ID and data
 */
export const UpdateOpenSpaceInputSchema = z.object({
  id: z.string().min(1, "OpenSpace ID is required"),
  data: UpdateOpenSpaceSchema,
});

// Type exports
export type OpenSpace = z.infer<typeof OpenSpaceSchema>;
export type CreateOpenSpaceInput = z.infer<typeof CreateOpenSpaceSchema>;
export type UpdateOpenSpaceInput = z.infer<typeof UpdateOpenSpaceSchema>;
export type GetOpenSpaceInput = z.infer<typeof GetOpenSpaceSchema>;
export type DeleteOpenSpaceInput = z.infer<typeof DeleteOpenSpaceSchema>;
export type UpdateOpenSpaceInputType = z.infer<typeof UpdateOpenSpaceInputSchema>;
