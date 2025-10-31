import { z } from "zod";

/**
 * Core Track schema with all fields (formerly StickyNote)
 */
export const TrackSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Title is required"),
  speaker: z.string().optional(),
  description: z.string().optional(),
  needsTV: z.boolean().default(false).describe("Track requires a TV/projector"),
  needsWhiteboard: z.boolean().default(false).describe("Track requires a whiteboard"),
  openSpaceId: z.string().min(1, "OpenSpace ID is required"),
  scheduleId: z.string().min(1, "Schedule ID is required"),
  roomId: z.string().min(1, "Room ID is required"),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/**
 * Schema for creating a new track (omits auto-generated fields)
 * Includes optional display fields for optimistic UI updates
 */
export const CreateTrackSchema = TrackSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Display fields for optimistic updates (not stored in DB, computed from relations)
  room: z.string().optional(),
  timeSlot: z.string().optional(),
  // Allow bypassing resource validation when user confirms
  skipResourceValidation: z.boolean().optional().default(false),
});

/**
 * Schema for updating a track (all fields optional except constraints)
 */
export const UpdateTrackSchema = z
  .object({
    title: z.string().min(1, "Title is required").optional(),
    speaker: z.string().optional(),
    description: z.string().optional(),
    needsTV: z.boolean().optional(),
    needsWhiteboard: z.boolean().optional(),
    scheduleId: z.string().optional(),
    roomId: z.string().optional(),
    // Display fields for optimistic updates (not stored in DB, computed from relations)
    room: z.string().optional(),
    timeSlot: z.string().optional(),
    // Allow bypassing resource validation when user confirms
    skipResourceValidation: z.boolean().optional().default(false),
  })
  .partial();

/**
 * Schema for getting a track by ID
 */
export const GetTrackSchema = z.object({
  id: z.string().min(1, "Track ID is required"),
});

/**
 * Schema for deleting a track by ID
 */
export const DeleteTrackSchema = z.object({
  id: z.string().min(1, "Track ID is required"),
});

/**
 * Schema for updating a track with ID and data
 */
export const UpdateTrackInputSchema = z.object({
  id: z.string().min(1, "Track ID is required"),
  data: UpdateTrackSchema,
});

/**
 * Schema for swapping two tracks
 */
export const SwapTracksSchema = z.object({
  trackAId: z.string().min(1, "First track ID is required"),
  trackBId: z.string().min(1, "Second track ID is required"),
});

/**
 * Schema for getting tracks by OpenSpace ID
 */
export const GetTracksByOpenSpaceSchema = z.object({
  openSpaceId: z.string().min(1, "OpenSpace ID is required"),
  highlightedOnly: z.boolean().optional().default(false),
});

// Type exports
export type Track = z.infer<typeof TrackSchema>;
export type CreateTrackInput = z.infer<typeof CreateTrackSchema>;
export type UpdateTrackInput = z.infer<typeof UpdateTrackSchema>;
export type GetTrackInput = z.infer<typeof GetTrackSchema>;
export type DeleteTrackInput = z.infer<typeof DeleteTrackSchema>;
export type UpdateTrackInputType = z.infer<typeof UpdateTrackInputSchema>;
export type SwapTracksInput = z.infer<typeof SwapTracksSchema>;
export type GetTracksByOpenSpaceInput = z.infer<typeof GetTracksByOpenSpaceSchema>;

// StickyNote type for UI compatibility (includes room and timeSlot as readable strings)
export type StickyNote = Track & {
  room: string;
  timeSlot: string;
  skipResourceValidation?: boolean; // Optional flag to skip validation during updates
};
