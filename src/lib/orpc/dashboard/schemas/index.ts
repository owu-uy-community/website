import { z } from "zod";

/**
 * Schema for dashboard statistics.
 * eventId is optional until the multi-tenant refactor makes it required.
 */
export const GetDashboardStatsSchema = z
  .object({
    eventId: z.string().optional(),
  })
  .optional();

const DashboardScheduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  highlightInKiosk: z.boolean(),
});

/**
 * Dashboard statistics response type
 */
export const DashboardStatsSchema = z.object({
  event: z
    .object({
      id: z.string(),
      name: z.string(),
      startDate: z.date().nullable(),
      endDate: z.date().nullable(),
      status: z.enum(["active", "inactive", "upcoming"]),
    })
    .nullable(),
  totalSessions: z.number(),
  activeRooms: z.number(),
  totalSchedules: z.number(),
  /** Total cells of the board (active schedules × active rooms). */
  gridCells: z.number(),
  /** 0..1 — filled cells over total cells. */
  gridOccupancy: z.number(),
  sessionsByRoom: z.array(z.object({ roomId: z.string(), room: z.string(), sessions: z.number() })),
  currentSchedule: DashboardScheduleSchema.nullable(),
  nextSchedule: DashboardScheduleSchema.nullable(),
  highlightedSchedule: DashboardScheduleSchema.nullable(),
  recentTracks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      speaker: z.string().nullable(),
      room: z.string().nullable(),
      timeSlot: z.string().nullable(),
      updatedAt: z.date(),
    })
  ),
  /** Null when Eventbrite is unreachable or unconfigured — the UI says so instead of faking zeros. */
  eventbrite: z
    .object({
      eventName: z.string().optional(),
      totalParticipants: z.number(),
      checkedIn: z.number(),
    })
    .nullable(),
});

// Type exports
export type GetDashboardStatsInput = z.infer<typeof GetDashboardStatsSchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type DashboardSchedule = z.infer<typeof DashboardScheduleSchema>;
