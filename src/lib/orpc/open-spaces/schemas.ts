import * as z from "zod";

const slug = z.string().regex(/^[a-z0-9-]+$/, "Usá minúsculas, números y guiones");

/**
 * The editable fields of an event, with no defaults: an update must only
 * touch what it was sent (zod 4's `.partial()` keeps `.default()`s, which is
 * how a rename used to re-activate an inactive event).
 */
const EventFields = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().optional(),
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime(),
  isActive: z.boolean(),
  autoHighlightEnabled: z.boolean(),
  slug,
  timezone: z.string().min(1),
  eventbriteEventId: z.string().nullable(),
  venueMapUrl: z.url().nullable(),
});

/** What the API returns. Shapes only — input rules don't apply to rows already stored. */
export const OpenSpaceSchema = z.object({
  id: z.string(),
  communityId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean(),
  autoHighlightEnabled: z.boolean(),
  slug: z.string(),
  timezone: z.string(),
  eventbriteEventId: z.string().nullable(),
  venueMapUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateOpenSpaceSchema = EventFields.extend({
  communityId: z.string().min(1),
  isActive: z.boolean().default(true),
  autoHighlightEnabled: z.boolean().default(false),
  slug: slug.optional(),
  timezone: z.string().min(1).optional(),
  eventbriteEventId: z.string().nullable().optional(),
  venueMapUrl: z.url().nullable().optional(),
});

export const UpdateOpenSpaceInputSchema = z.object({
  id: z.string().min(1),
  data: EventFields.partial(),
});

export const EventIdSchema = z.object({ id: z.string().min(1) });
export const ListOpenSpacesByCommunitySchema = z.object({ communityId: z.string().min(1) });

export const AdminEventOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  startDate: z.string(),
  communityId: z.string(),
  communityName: z.string(),
  communitySlug: z.string(),
});

export type OpenSpace = z.infer<typeof OpenSpaceSchema>;
export type AdminEventOption = z.infer<typeof AdminEventOptionSchema>;
export type CreateOpenSpaceInput = z.infer<typeof CreateOpenSpaceSchema>;
export type UpdateOpenSpaceInput = z.infer<typeof UpdateOpenSpaceInputSchema>["data"];
