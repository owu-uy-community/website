import { desc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { events, rooms, schedules, tracks, type ScheduleRow } from "../../db/schema";
import { query } from "../db";
import { NotFound } from "../errors";
import * as Eventbrite from "../eventbrite/service";
import type { DashboardSchedule, DashboardStats } from "./schemas";

/** "YYYY-MM-DD" and "HH:MM" of an instant on a time zone's wall clock. */
const wallClock = (at: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

/** A slot's day is stored as a date-only value (UTC midnight); its times are the event's wall clock. */
const slotStart = (slot: ScheduleRow) => `${slot.date.toISOString().slice(0, 10)}T${slot.startTime}`;
const slotEnd = (slot: ScheduleRow) => `${slot.date.toISOString().slice(0, 10)}T${slot.endTime}`;

const toDashboardSchedule = (row: ScheduleRow | undefined): DashboardSchedule | null =>
  row
    ? {
        id: row.id,
        name: row.name,
        startTime: row.startTime,
        endTime: row.endTime,
        highlightInKiosk: row.highlightInKiosk,
      }
    : null;

/**
 * An event at a glance. Database failures are not swallowed — a broken
 * database must not render as a healthy all-zeros dashboard; only Eventbrite
 * (external, optional) degrades to null.
 */
export const getStats = (eventId: string) =>
  Effect.gen(function* () {
    const [[event], slotRows, roomRows, trackRows, recentRows, eventbrite] = yield* Effect.all(
      [
        query((db) => db.select().from(events).where(eq(events.id, eventId))),
        query((db) => db.select().from(schedules).where(eq(schedules.openSpaceId, eventId))),
        query((db) => db.select().from(rooms).where(eq(rooms.openSpaceId, eventId))),
        query((db) =>
          db.select({ id: tracks.id, roomId: tracks.roomId }).from(tracks).where(eq(tracks.openSpaceId, eventId))
        ),
        query((db) =>
          db.query.tracks.findMany({
            where: eq(tracks.openSpaceId, eventId),
            with: { room: true, schedule: true },
            orderBy: desc(tracks.updatedAt),
            limit: 5,
          })
        ),
        Eventbrite.getSummary().pipe(Effect.orElseSucceed(() => null)),
      ],
      { concurrency: "unbounded" }
    );
    if (!event) return yield* new NotFound({ entity: "event", message: "Ese evento no existe" });

    const now = new Date();
    const status = now < event.startDate ? "upcoming" : now <= event.endDate ? "active" : "inactive";

    const activeRooms = roomRows.filter((room) => room.isActive);
    const activeSlots = slotRows
      .filter((slot) => slot.isActive)
      .toSorted((a, b) => slotStart(a).localeCompare(slotStart(b)));
    const gridCells = activeSlots.length * activeRooms.length;

    const clock = wallClock(now, event.timezone);
    const current = activeSlots.find((slot) => slotStart(slot) <= clock && clock < slotEnd(slot));
    const next = activeSlots.find((slot) => slotStart(slot) > clock);

    return {
      event: { id: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate, status },
      totalSessions: trackRows.length,
      activeRooms: activeRooms.length,
      totalSchedules: activeSlots.length,
      gridCells,
      gridOccupancy: gridCells > 0 ? trackRows.length / gridCells : 0,
      sessionsByRoom: activeRooms
        .map((room) => ({
          roomId: room.id,
          room: room.name,
          sessions: trackRows.filter((track) => track.roomId === room.id).length,
        }))
        .toSorted((a, b) => b.sessions - a.sessions),
      currentSchedule: toDashboardSchedule(current),
      nextSchedule: toDashboardSchedule(next),
      highlightedSchedule: toDashboardSchedule(slotRows.find((slot) => slot.highlightInKiosk)),
      recentTracks: recentRows.map((track) => ({
        id: track.id,
        title: track.title,
        speaker: track.speaker,
        room: track.room?.name ?? null,
        timeSlot: track.schedule ? `${track.schedule.startTime} - ${track.schedule.endTime}` : null,
        updatedAt: track.updatedAt,
      })),
      eventbrite: eventbrite
        ? {
            eventName: eventbrite.event.name,
            totalParticipants: eventbrite.summary.total_attendees,
            checkedIn: eventbrite.summary.checked_in,
          }
        : null,
    } satisfies DashboardStats;
  });
