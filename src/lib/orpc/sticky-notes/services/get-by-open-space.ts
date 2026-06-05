import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { rooms, schedules, tracks } from "../../../db/schema";
import type { GetTracksByOpenSpaceInput } from "../schemas";
import { transformTrack } from "./transforms";

/**
 * Extended Track type with relations for kiosk display
 */
export type TrackWithRelations = {
  id: string;
  title: string;
  speaker?: string;
  description?: string;
  location: string; // Room name
  color?: string;
  openSpaceId: string;
  scheduleId: string;
  roomId: string;
  createdAt: string;
  updatedAt: string;
  room: {
    id: string;
    name: string;
  };
  schedule: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    date: string;
    highlightInKiosk: boolean;
  };
};

/**
 * Get tracks by OpenSpace ID with optional filtering by highlighted schedules
 */
export const getTracksByOpenSpace = async ({
  openSpaceId,
  highlightedOnly = false,
}: GetTracksByOpenSpaceInput & { highlightedOnly?: boolean }): Promise<TrackWithRelations[]> => {
  // The query filters and orders by columns on the related `schedules` table,
  // which the relational-query API cannot express, so we use an explicit join.
  const rows = await db
    .select()
    .from(tracks)
    .innerJoin(rooms, eq(tracks.roomId, rooms.id))
    .innerJoin(schedules, eq(tracks.scheduleId, schedules.id))
    .where(
      highlightedOnly
        ? and(eq(tracks.openSpaceId, openSpaceId), eq(schedules.highlightInKiosk, true))
        : eq(tracks.openSpaceId, openSpaceId)
    )
    .orderBy(asc(schedules.date), asc(schedules.startTime));

  return rows.map(({ tracks: track, rooms: room, schedules: schedule }) => {
    const transformed = transformTrack(track);
    return {
      id: transformed.id,
      title: transformed.title,
      speaker: transformed.speaker,
      description: transformed.description,
      location: room.name, // Room name as location
      needsTV: transformed.needsTV,
      needsWhiteboard: transformed.needsWhiteboard,
      openSpaceId: transformed.openSpaceId,
      scheduleId: transformed.scheduleId,
      roomId: transformed.roomId,
      createdAt: transformed.createdAt || new Date().toISOString(),
      updatedAt: transformed.updatedAt || new Date().toISOString(),
      room: {
        id: room.id,
        name: room.name,
      },
      schedule: {
        id: schedule.id,
        name: schedule.name,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        date: schedule.date.toISOString(),
        highlightInKiosk: schedule.highlightInKiosk,
      },
    };
  });
};
