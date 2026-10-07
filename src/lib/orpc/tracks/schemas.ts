import * as z from "zod";

/** A talk as the board shows it: room and time slot as readable strings. */
export const StickyNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  speaker: z.string().optional(),
  description: z.string().optional(),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
  openSpaceId: z.string(),
  scheduleId: z.string(),
  roomId: z.string(),
  room: z.string(),
  /** The room's explicit color; the UI falls back to a palette. */
  roomColor: z.string().optional(),
  timeSlot: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A talk with its room and slot, for the kiosk agenda and the EPG. */
export const TrackWithRelationsSchema = z.object({
  id: z.string(),
  title: z.string(),
  speaker: z.string().optional(),
  description: z.string().optional(),
  location: z.string(),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
  openSpaceId: z.string(),
  scheduleId: z.string(),
  roomId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  room: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }),
  schedule: z.object({
    id: z.string(),
    name: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    date: z.string(),
    highlightInKiosk: z.boolean(),
  }),
});

const TalkFields = z.object({
  title: z.string().trim().min(1, "El título es obligatorio"),
  speaker: z.string().optional(),
  description: z.string().optional(),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
});

export const CreateTrackSchema = TalkFields.extend({
  openSpaceId: z.string().min(1),
  scheduleId: z.string().min(1),
  roomId: z.string().min(1),
  needsTV: z.boolean().default(false),
  needsWhiteboard: z.boolean().default(false),
  /** The staffer confirmed the room even though it lacks what the talk needs. */
  skipResourceValidation: z.boolean().default(false),
  /** Display-only labels the board paints on its optimistic card; the server ignores them. */
  room: z.string().optional(),
  timeSlot: z.string().optional(),
});

/** A talk with no place yet: the server picks one (the companion's spoken pitch). */
export const CreatePlacedTrackSchema = z.object({
  openSpaceId: z.string().min(1),
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  speaker: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  needsTV: z.boolean().default(false),
  needsWhiteboard: z.boolean().default(false),
  /** A request for the placement ("mejor a la tarde"), like the staff's note in the photo flow. */
  additionalContext: z.string().max(500).optional(),
  /** Who sent it ("companion"); logged, not stored. */
  source: z.string().max(40).optional(),
});

export const PlacementSchema = z.object({
  room: z.string(),
  timeSlot: z.string(),
  reasoning: z.string(),
  /** The AI did not answer: this is the first free cell, not a judgement. */
  degraded: z.boolean(),
  /** What the talk asked for and the room lacks (no room had it). */
  missing: z.array(z.enum(["tv", "whiteboard"])),
  /** Cells taken between the suggestion and the write. */
  skipped: z.array(z.object({ room: z.string(), timeSlot: z.string(), occupiedBy: z.string().optional() })),
});

export const PlacedTrackSchema = z.object({ note: StickyNoteSchema, placement: PlacementSchema });

export const UpdateTrackInputSchema = z.object({
  id: z.string().min(1),
  data: TalkFields.partial().extend({
    scheduleId: z.string().min(1).optional(),
    roomId: z.string().min(1).optional(),
    skipResourceValidation: z.boolean().optional(),
  }),
});

export const TrackIdSchema = z.object({ id: z.string().min(1) });
export const ListTracksSchema = z.object({ openSpaceId: z.string().min(1) });
export const GetTracksByOpenSpaceSchema = z.object({
  openSpaceId: z.string().min(1),
  highlightedOnly: z.boolean().default(false),
});
export const SwapTracksSchema = z.object({ trackAId: z.string().min(1), trackBId: z.string().min(1) });
export const BulkUpdateTracksByScheduleSchema = z.object({
  scheduleId: z.string().min(1),
  /** The label the board shows for the slot from now on ("15:00 - 15:45"). */
  newTimeSlot: z.string().min(1),
  /** Move every talk of the slot to this slot instead. */
  newScheduleId: z.string().min(1).optional(),
});

export type StickyNote = z.infer<typeof StickyNoteSchema>;
export type TrackWithRelations = z.infer<typeof TrackWithRelationsSchema>;
export type CreateTrackInput = z.infer<typeof CreateTrackSchema>;
export type CreatePlacedTrackInput = z.infer<typeof CreatePlacedTrackSchema>;
export type PlacedTrack = z.infer<typeof PlacedTrackSchema>;
export type UpdateTrackInput = z.infer<typeof UpdateTrackInputSchema>["data"];
