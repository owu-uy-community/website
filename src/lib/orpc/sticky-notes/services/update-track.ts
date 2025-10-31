import { prisma } from "../../../prisma";
import type { UpdateTrackInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Update an existing track with slot conflict validation
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const updateTrack = async ({ id, data }: { id: string; data: UpdateTrackInput }): Promise<StickyNote> => {
  // Check if track exists
  const currentTrack = await prisma.track.findUnique({
    where: { id },
  });

  if (!currentTrack) {
    console.error("❌ Track not found:", id);
    throw new Error("Track not found");
  }

  // Determine if validation is needed for schedule/room changes
  const hasScheduleOrRoomChanges =
    data.scheduleId !== undefined ||
    data.roomId !== undefined ||
    data.needsTV !== undefined ||
    data.needsWhiteboard !== undefined;

  if (hasScheduleOrRoomChanges) {
    const scheduleId = data.scheduleId ?? currentTrack.scheduleId;
    const roomId = data.roomId ?? currentTrack.roomId;

    const [schedule, room] = await Promise.all([
      prisma.schedule.findUnique({ where: { id: scheduleId } }),
      prisma.room.findUnique({ where: { id: roomId } }),
    ]);

    if (!schedule) {
      throw new Error("Schedule not found");
    }
    if (!room) {
      throw new Error("Room not found");
    }

    // Validate room has required resources (unless validation is skipped)
    const needsTV = data.needsTV ?? currentTrack.needsTV;
    const needsWhiteboard = data.needsWhiteboard ?? currentTrack.needsWhiteboard;

    if (!data.skipResourceValidation) {
      if (needsTV && !room.hasTV) {
        throw new Error(`Room "${room.name}" does not have a TV/projector`);
      }
      if (needsWhiteboard && !room.hasWhiteboard) {
        throw new Error(`Room "${room.name}" does not have a whiteboard`);
      }
    }

    // Check for slot conflicts if schedule/room changed
    const existingTrack = await prisma.track.findFirst({
      where: {
        scheduleId,
        roomId,
        id: { not: id },
      },
    });

    if (existingTrack) {
      throw new Error(`Slot is already occupied by "${existingTrack.title}"`);
    }
  }

  const updateData = {
    updatedAt: new Date(),
    ...(data.title !== undefined && { title: data.title }),
    ...(data.speaker !== undefined && { speaker: data.speaker || null }),
    ...(data.description !== undefined && { description: data.description || null }),
    ...(data.needsTV !== undefined && { needsTV: data.needsTV }),
    ...(data.needsWhiteboard !== undefined && { needsWhiteboard: data.needsWhiteboard }),
    ...(data.scheduleId !== undefined && { scheduleId: data.scheduleId }),
    ...(data.roomId !== undefined && { roomId: data.roomId }),
  };

  try {
    const track = await prisma.track.update({
      where: { id },
      data: updateData,
      include: {
        room: true,
        schedule: true,
      },
    });

    return transformTrackForStickyNote(track);
  } catch (error) {
    console.error("❌ Prisma update error:", error);
    throw error;
  }
};
