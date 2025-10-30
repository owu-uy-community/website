import { z } from "zod";

/**
 * Core Schedule schema with all fields
 */
export const ScheduleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  date: z.string().datetime(),
  isActive: z.boolean().default(true),
  highlightInKiosk: z.boolean().default(false),
  openSpaceId: z.string().min(1, "OpenSpace ID is required"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Schema for creating a new schedule (omits auto-generated fields)
 */
export const CreateScheduleSchema = ScheduleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Schema for updating a schedule (all fields optional except constraints)
 */
export const UpdateScheduleSchema = CreateScheduleSchema.omit({ openSpaceId: true }).partial();

/**
 * Schema for getting a schedule by ID
 */
export const GetScheduleSchema = z.object({
  id: z.string().min(1, "Schedule ID is required"),
});

/**
 * Schema for deleting a schedule by ID
 */
export const DeleteScheduleSchema = z.object({
  id: z.string().min(1, "Schedule ID is required"),
});

/**
 * Schema for updating a schedule with ID and data
 */
export const UpdateScheduleInputSchema = z.object({
  id: z.string().min(1, "Schedule ID is required"),
  data: UpdateScheduleSchema,
});

/**
 * Schema for getting schedules by OpenSpace ID
 */
export const GetSchedulesByOpenSpaceSchema = z.object({
  openSpaceId: z.string().min(1, "OpenSpace ID is required"),
});

// Type exports
export type Schedule = z.infer<typeof ScheduleSchema>;
export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;
export type GetScheduleInput = z.infer<typeof GetScheduleSchema>;
export type DeleteScheduleInput = z.infer<typeof DeleteScheduleSchema>;
export type UpdateScheduleInputType = z.infer<typeof UpdateScheduleInputSchema>;
export type GetSchedulesByOpenSpaceInput = z.infer<typeof GetSchedulesByOpenSpaceSchema>;
