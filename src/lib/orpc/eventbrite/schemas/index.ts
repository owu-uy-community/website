import { z } from "zod";

/**
 * Schema for Eventbrite attendee query parameters
 */
export const GetAttendeesSchema = z.object({
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).max(100).optional().default(50),
  status: z.string().optional(),
});

/**
 * Schema for Eventbrite summary (no input needed, uses configured event)
 */
export const GetSummarySchema = z.object({}).optional();

// Type exports
export type GetAttendeesInput = z.infer<typeof GetAttendeesSchema>;
export type GetSummaryInput = z.infer<typeof GetSummarySchema>;
