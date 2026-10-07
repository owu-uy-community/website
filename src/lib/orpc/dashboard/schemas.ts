import * as z from "zod";

export const GetDashboardStatsSchema = z.object({ eventId: z.string().min(1) });

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
  event: z.object({
    id: z.string(),
    name: z.string(),
    startDate: z.date(),
    endDate: z.date(),
    status: z.enum(["active", "inactive", "upcoming"]),
  }),
  totalSessions: z.number(),
  activeRooms: z.number(),
  totalSchedules: z.number(),
  /** Total cells of the board (active schedules × active rooms). */
  gridCells: z.number(),
  /** 0..1 — filled cells over total cells. */
  gridOccupancy: z.number(),
  sessionsByRoom: z.array(z.object({ roomId: z.string(), room: z.string(), sessions: z.number() })),
  /** The slot happening now and the next one, on the event's own clock. */
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

export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type DashboardSchedule = z.infer<typeof DashboardScheduleSchema>;
