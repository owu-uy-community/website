import { z } from "zod";

/**
 * Schema for OCR image processing input
 */
export const ProcessImageSchema = z.object({
  imageData: z.string().describe("Base64 encoded image data"),
});

/**
 * Schema for OCR processing output
 */
export const ProcessImageResponseSchema = z.object({
  title: z.string().describe("Extracted talk title"),
  speaker: z.string().describe("Extracted speaker name"),
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
  roomsWithResources: z.array(
    z.object({
      name: z.string(),
      hasTV: z.boolean(),
      hasWhiteboard: z.boolean(),
    })
  ).describe("Available rooms with their resources"),
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
  swapSuggestion: z
    .object({
      shouldSwap: z.boolean().describe("Whether a swap is recommended"),
      talkToSwap: z.string().optional().describe("Title of the talk to swap"),
      swapReasoning: z.string().optional().describe("Reason for suggesting the swap"),
    })
    .optional()
    .describe("Optional swap suggestion if no better slots are available"),
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

export type ProcessImageInput = z.infer<typeof ProcessImageSchema>;
export type ProcessImageResponse = z.infer<typeof ProcessImageResponseSchema>;
export type FindFreeSpotInput = z.infer<typeof FindFreeSpotSchema>;
export type FindFreeSpotResponse = z.infer<typeof FindFreeSpotResponseSchema>;






