import * as z from "zod";

/**
 * A card photo as a data URL. A request can't carry more than ~4.5 MB on
 * Vercel, and the camera tab sends ~150–400 KB; anything bigger is refused
 * before a model is paid to look at it.
 */
const imageData = z
  .string()
  .regex(/^data:image\/[\w+.-]+;base64,/, "Mandá la foto como data URL de imagen")
  .max(4_000_000, "La foto es demasiado grande: sacala de nuevo o achicala");

/** Which REQUISITOS checkbox the proposer marked on the card. */
export const RequisitoSchema = z.enum(["tv", "pizarra", "ambos", "ninguno", "ilegible"]);

/** Fields the model was unsure about, so the UI can ask a human to check them. */
export const RevisarSchema = z.array(z.enum(["speaker", "title", "requisito"]));

/** What was read off a card. */
export const ProcessImageResponseSchema = z.object({
  title: z.string(),
  speaker: z.string(),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
  /** The raw REQUISITOS answer, including "ninguno" and "ilegible". */
  requisito: RequisitoSchema.optional(),
  /** Fields whose handwriting was unclear. */
  revisar: RevisarSchema.optional(),
});
export type ProcessImageResponse = z.infer<typeof ProcessImageResponseSchema>;

/** The name and title as the model writes them, before the card is fully read. */
export const CardFieldsSchema = z.object({ title: z.string().optional(), speaker: z.string().optional() });
export type CardFields = z.infer<typeof CardFieldsSchema>;

/** A talk to place on an event's board. The server knows the board; the caller only says what the talk needs. */
export const FindFreeSpotSchema = z.object({
  eventId: z.string().min(1),
  title: z.string().max(200),
  speaker: z.string().max(200).default(""),
  needsTV: z.boolean().default(false),
  needsWhiteboard: z.boolean().default(false),
  /** A note from the staff for the suggestion ("better in the afternoon"). */
  additionalContext: z.string().max(500).optional(),
});

export const FindFreeSpotResponseSchema = z.object({
  suggestedRoom: z.string(),
  suggestedTimeSlot: z.string(),
  reasoning: z.string(),
  /** True when the AI call failed and this is just the first free cell, not a suggestion. */
  degraded: z.boolean().optional(),
  /** Alternatives ranked by preference. */
  alternatives: z.array(z.object({ room: z.string(), timeSlot: z.string(), reasoning: z.string() })).optional(),
});
export type FindFreeSpotResponse = z.infer<typeof FindFreeSpotResponseSchema>;

export const ExtractCardSchema = z.object({
  eventId: z.string().min(1),
  imageData,
  additionalContext: z.string().max(500).optional(),
});

/**
 * What a card photo streams back: the name and title as they are read, then
 * the whole card, then — if it has a title — a place for it on the board.
 */
export const CardEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fields"), fields: CardFieldsSchema }),
  z.object({ type: z.literal("card"), card: ProcessImageResponseSchema }),
  z.object({ type: z.literal("suggestion"), suggestion: FindFreeSpotResponseSchema }),
]);
export type CardEvent = z.infer<typeof CardEventSchema>;

/** OCR and a place in one answer, for callers that can't take a stream (Owy's photo tool). */
export const ProcessImageWithSuggestionSchema = ExtractCardSchema;
export const ProcessImageWithSuggestionResponseSchema = ProcessImageResponseSchema.extend(
  FindFreeSpotResponseSchema.shape
);
