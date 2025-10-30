import { prisma } from "../../../prisma";
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
  const tracks = await prisma.track.findMany({
    where: {
      openSpaceId,
      ...(highlightedOnly ? { schedule: { highlightInKiosk: true } } : {}),
    },
    include: {
      room: true,
      schedule: true,
    },
    orderBy: [{ schedule: { date: "asc" } }, { schedule: { startTime: "asc" } }],
  });

  return tracks.map((track) => {
    const transformed = transformTrack(track);
    return {
      id: transformed.id,
      title: transformed.title,
      speaker: transformed.speaker,
      description: transformed.description,
      location: track.room.name, // Room name as location
      needsTV: transformed.needsTV,
      needsWhiteboard: transformed.needsWhiteboard,
      openSpaceId: transformed.openSpaceId,
      scheduleId: transformed.scheduleId,
      roomId: transformed.roomId,
      createdAt: transformed.createdAt || new Date().toISOString(),
      updatedAt: transformed.updatedAt || new Date().toISOString(),
      room: {
        id: track.room.id,
        name: track.room.name,
      },
      schedule: {
        id: track.schedule.id,
        name: track.schedule.name,
        startTime: track.schedule.startTime,
        endTime: track.schedule.endTime,
        date: track.schedule.date.toISOString(),
        highlightInKiosk: track.schedule.highlightInKiosk,
      },
    };
  });
};
