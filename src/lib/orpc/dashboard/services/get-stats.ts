import { desc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { openSpaces, rooms, schedules, tracks } from "../../../db/schema";
import { getSummary } from "../../eventbrite/services/get-summary";
import type { DashboardSchedule, DashboardStats } from "../schemas";

// TODO(multi-tenant): becomes a required eventId input once events are community-scoped.
const DEFAULT_OPENSPACE_ID = "default-openspace";

type ScheduleRow = typeof schedules.$inferSelect;

function scheduleDateTime(base: Date | null, time: string): Date | null {
  if (!base) return null;

  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  const result = new Date(base);
  result.setHours(hours, minutes, 0, 0);

  return result;
}

function toDashboardSchedule(row: ScheduleRow | null | undefined): DashboardSchedule | null {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    highlightInKiosk: row.highlightInKiosk,
  };
}

/**
 * Get dashboard statistics aggregating data from multiple sources.
 * DB failures are NOT swallowed — a broken database must not render as a
 * healthy all-zeros dashboard. Only Eventbrite (external) degrades to null.
 */
export const getDashboardStats = async (eventId: string = DEFAULT_OPENSPACE_ID): Promise<DashboardStats> => {
  const [eventRows, scheduleRows, roomRows, trackRows, recentTrackRows, eventbriteSummary] = await Promise.all([
    db.select().from(openSpaces).where(eq(openSpaces.id, eventId)).limit(1),
    db.select().from(schedules).where(eq(schedules.openSpaceId, eventId)),
    db.select().from(rooms).where(eq(rooms.openSpaceId, eventId)),
    db.select({ id: tracks.id, roomId: tracks.roomId }).from(tracks).where(eq(tracks.openSpaceId, eventId)),
    db.query.tracks.findMany({
      where: eq(tracks.openSpaceId, eventId),
      with: { room: true, schedule: true },
      orderBy: desc(tracks.updatedAt),
      limit: 5,
    }),
    getSummary().catch(() => null),
  ]);

  const eventRow = eventRows[0] ?? null;

  let status: "active" | "inactive" | "upcoming" = "inactive";
  if (eventRow) {
    const now = new Date();
    const startDate = eventRow.startDate ? new Date(eventRow.startDate) : null;
    const endDate = eventRow.endDate ? new Date(eventRow.endDate) : null;

    if (startDate && endDate) {
      if (now >= startDate && now <= endDate) {
        status = "active";
      } else if (now < startDate) {
        status = "upcoming";
      }
    }
  }

  const activeRooms = roomRows.filter((room) => room.isActive);
  const activeSchedules = scheduleRows.filter((schedule) => schedule.isActive);
  const gridCells = activeSchedules.length * activeRooms.length;
  const gridOccupancy = gridCells > 0 ? trackRows.length / gridCells : 0;

  const sessionsByRoom = activeRooms
    .map((room) => ({
      roomId: room.id,
      room: room.name,
      sessions: trackRows.filter((track) => track.roomId === room.id).length,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const now = new Date();
  const sortedSchedules = [...activeSchedules].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const currentSchedule =
    sortedSchedules.find((schedule) => {
      const start = scheduleDateTime(schedule.date, schedule.startTime);
      const end = scheduleDateTime(schedule.date, schedule.endTime);

      return start !== null && end !== null && now >= start && now <= end;
    }) ?? null;
  const nextSchedule =
    sortedSchedules.find((schedule) => {
      const start = scheduleDateTime(schedule.date, schedule.startTime);

      return start !== null && start > now;
    }) ?? null;
  const highlightedSchedule = scheduleRows.find((schedule) => schedule.highlightInKiosk) ?? null;

  return {
    event: eventRow
      ? {
          id: eventRow.id,
          name: eventRow.name,
          startDate: eventRow.startDate ?? null,
          endDate: eventRow.endDate ?? null,
          status,
        }
      : null,
    totalSessions: trackRows.length,
    activeRooms: activeRooms.length,
    totalSchedules: activeSchedules.length,
    gridCells,
    gridOccupancy,
    sessionsByRoom,
    currentSchedule: toDashboardSchedule(currentSchedule),
    nextSchedule: toDashboardSchedule(nextSchedule),
    highlightedSchedule: toDashboardSchedule(highlightedSchedule),
    recentTracks: recentTrackRows.map((track) => ({
      id: track.id,
      title: track.title,
      speaker: track.speaker,
      room: track.room?.name ?? null,
      timeSlot: track.schedule ? `${track.schedule.startTime} - ${track.schedule.endTime}` : null,
      updatedAt: track.updatedAt,
    })),
    eventbrite: eventbriteSummary
      ? {
          eventName: eventbriteSummary.event.name,
          totalParticipants: eventbriteSummary.summary.total_attendees,
          checkedIn: eventbriteSummary.summary.checked_in,
        }
      : null,
  };
};
