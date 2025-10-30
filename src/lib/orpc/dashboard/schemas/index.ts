import { z } from "zod";

/**
 * Schema for dashboard statistics (no input needed)
 */
export const GetDashboardStatsSchema = z.object({}).optional();

/**
 * Dashboard statistics response type
 */
export const DashboardStatsSchema = z.object({
  totalSessions: z.number(),
  activeRooms: z.number(),
  totalParticipants: z.number(),
  checkedInParticipants: z.number(),
  openSpaceStatus: z.enum(["active", "inactive", "upcoming"]),
  eventName: z.string().optional(),
});

// Type exports
export type GetDashboardStatsInput = z.infer<typeof GetDashboardStatsSchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
