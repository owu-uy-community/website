import { z } from "zod";

/**
 * Schema for OCR image processing input
 */
export const ProcessImageSchema = z.object({
  imageData: z.string().describe("Base64 encoded image data"),
});

/** Which REQUISITOS checkbox the proposer marked on the card. */
export const RequisitoSchema = z.enum(["tv", "pizarra", "ambos", "ninguno", "ilegible"]);

/** Fields the model was unsure about, so the UI can ask a human to check them. */
export const RevisarSchema = z.array(z.enum(["speaker", "title", "requisito"]));

/**
 * Schema for OCR processing output
 */
export const ProcessImageResponseSchema = z.object({
  title: z.string().describe("Extracted talk title"),
  speaker: z.string().describe("Extracted speaker name"),
  needsTV: z.boolean().default(false).describe("Whether the person marked with an X that they need a TV"),
  needsWhiteboard: z
    .boolean()
    .default(false)
    .describe("Whether the person marked with an X that they need a whiteboard"),
  requisito: RequisitoSchema.optional().describe("The raw REQUISITOS answer, including 'ninguno' and 'ilegible'"),
  revisar: RevisarSchema.optional().describe("Fields whose handwriting was unclear"),
});

/**
 * Schema for finding free spot with AI
 */
export const FindFreeSpotSchema = z.object({
  title: z.string().describe("Talk title"),
  speaker: z.string().describe("Speaker name"),
  needsTV: z.boolean().default(false).describe("Talk requires a TV/projector"),
  needsWhiteboard: z.boolean().default(false).describe("Talk requires a whiteboard"),
  additionalContext: z.string().optional().describe("Additional context or requirements for scheduling"),
  existingNotes: z.array(
    z.object({
      id: z.string().optional(),
      title: z.string(),
      speaker: z.string().optional(),
      room: z.string(),
      timeSlot: z.string(),
      needsTV: z.boolean().optional(),
      needsWhiteboard: z.boolean().optional(),
    })
  ),
  roomsWithResources: z
    .array(
      z.object({
        name: z.string(),
        hasTV: z.boolean(),
        hasWhiteboard: z.boolean(),
      })
    )
    .describe("Available rooms with their resources"),
  availableRooms: z.array(z.string()),
  availableTimeSlots: z.array(z.string()),
});

/**
 * Schema for free spot result
 */
export const FindFreeSpotResponseSchema = z.object({
  suggestedRoom: z.string().describe("Suggested room"),
  suggestedTimeSlot: z.string().describe("Suggested time slot"),
  reasoning: z.string().describe("Reasoning for the suggestion"),
  degraded: z
    .boolean()
    .optional()
    .describe("True when the AI call failed and this is just the first free cell, not a suggestion"),
  alternatives: z
    .array(
      z.object({
        room: z.string(),
        timeSlot: z.string(),
        reasoning: z.string(),
      })
    )
    .optional()
    .describe("Alternative suggestions ranked by preference"),
});

/**
 * Schema for combined OCR + AI suggestion
 */
export const ProcessImageWithSuggestionSchema = z.object({
  imageData: z.string().describe("Base64 encoded image data"),
  existingNotes: z.array(
    z.object({
      id: z.string().optional(),
      title: z.string(),
      speaker: z.string().optional(),
      room: z.string(),
      timeSlot: z.string(),
      needsTV: z.boolean().optional(),
      needsWhiteboard: z.boolean().optional(),
    })
  ),
  roomsWithResources: z
    .array(
      z.object({
        name: z.string(),
        hasTV: z.boolean(),
        hasWhiteboard: z.boolean(),
      })
    )
    .describe("Available rooms with their resources"),
  availableRooms: z.array(z.string()),
  availableTimeSlots: z.array(z.string()),
  additionalContext: z.string().optional().describe("Additional context or requirements for scheduling"),
});

/**
 * Schema for combined OCR + AI suggestion response
 */
export const ProcessImageWithSuggestionResponseSchema = ProcessImageResponseSchema.extend(
  FindFreeSpotResponseSchema.shape
);

export type ProcessImageInput = z.infer<typeof ProcessImageSchema>;
export type ProcessImageResponse = z.infer<typeof ProcessImageResponseSchema>;
export type FindFreeSpotInput = z.infer<typeof FindFreeSpotSchema>;
export type FindFreeSpotResponse = z.infer<typeof FindFreeSpotResponseSchema>;
export type ProcessImageWithSuggestionInput = z.infer<typeof ProcessImageWithSuggestionSchema>;
export type ProcessImageWithSuggestionResponse = z.infer<typeof ProcessImageWithSuggestionResponseSchema>;
