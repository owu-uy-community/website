import { prisma } from "../../../prisma";
import type { CreateTrackInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Create a new track with slot conflict validation
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const createTrack = async (input: CreateTrackInput): Promise<StickyNote> => {
  // Verify the OpenSpace, Schedule, and Room exist
  const [openSpace, schedule, room] = await Promise.all([
    prisma.openSpace.findUnique({ where: { id: input.openSpaceId } }),
    prisma.schedule.findUnique({ where: { id: input.scheduleId } }),
    prisma.room.findUnique({ where: { id: input.roomId } }),
  ]);

  if (!openSpace) {
    throw new Error("OpenSpace not found");
  }
  if (!schedule) {
    throw new Error("Schedule not found");
  }
  if (!room) {
    throw new Error("Room not found");
  }

  // Validate room has required resources (unless validation is skipped)
  if (!input.skipResourceValidation) {
    if (input.needsTV && !room.hasTV) {
      throw new Error(`Room "${room.name}" does not have a TV/projector`);
    }
    if (input.needsWhiteboard && !room.hasWhiteboard) {
      throw new Error(`Room "${room.name}" does not have a whiteboard`);
    }
  }

  // Check for slot conflicts (one track per room per schedule)
  const existingTrack = await prisma.track.findFirst({
    where: {
      scheduleId: input.scheduleId,
      roomId: input.roomId,
    },
  });

  if (existingTrack) {
    throw new Error(`Slot is already occupied by "${existingTrack.title}"`);
  }

  const track = await prisma.track.create({
    data: {
      title: input.title,
      speaker: input.speaker || null,
      description: input.description || null,
      needsTV: input.needsTV || false,
      needsWhiteboard: input.needsWhiteboard || false,

      openSpaceId: input.openSpaceId,
      scheduleId: input.scheduleId,
      roomId: input.roomId,
    },
    include: {
      room: true,
      schedule: true,
    },
  });

  return transformTrackForStickyNote(track);
};
