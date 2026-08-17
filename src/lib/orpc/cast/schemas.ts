import { z } from "zod";

export const GetCastStateSchema = z
  .object({
    eventId: z.string().optional(), // TODO(multi-tenant): becomes required
  })
  .optional();

export const SetHighlightedNoteSchema = z.object({
  eventId: z.string().optional(), // TODO(multi-tenant): becomes required
  trackId: z.string().nullable(),
});

export type GetCastStateInput = z.infer<typeof GetCastStateSchema>;
export type SetHighlightedNoteInput = z.infer<typeof SetHighlightedNoteSchema>;
