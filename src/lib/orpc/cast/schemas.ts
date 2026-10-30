import * as z from "zod";

import { StickyNoteSchema } from "../tracks/schemas";

export const GetCastStateSchema = z.object({ eventId: z.string().min(1) });

export const SetHighlightedNoteSchema = z.object({
  eventId: z.string().min(1),
  /** The talk to put on the screens, or null to clear them. */
  trackId: z.string().min(1).nullable(),
});

export const CastStateSchema = z.object({
  trackId: z.string().nullable(),
  note: StickyNoteSchema.nullable(),
});

export type CastState = z.infer<typeof CastStateSchema>;
