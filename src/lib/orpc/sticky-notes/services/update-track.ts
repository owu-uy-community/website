import { and, eq, ne } from "drizzle-orm";
import { db } from "../../../db";
import { rooms, schedules, tracks } from "../../../db/schema";
import type { UpdateTrackInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Update an existing track with slot conflict validation
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const updateTrack = async ({ id, data }: { id: string; data: UpdateTrackInput }): Promise<StickyNote> => {
  // Check if track exists
  const [currentTrack] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);

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
      db.query.schedules.findFirst({ where: eq(schedules.id, scheduleId) }),
      db.query.rooms.findFirst({ where: eq(rooms.id, roomId) }),
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
    const [existingTrack] = await db
      .select()
      .from(tracks)
      .where(and(eq(tracks.scheduleId, scheduleId), eq(tracks.roomId, roomId), ne(tracks.id, id)))
      .limit(1);

    if (existingTrack) {
      throw new Error(`Slot is already occupied by "${existingTrack.title}"`);
    }
  }

  const updateData: Partial<typeof tracks.$inferInsert> = {
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
    await db.update(tracks).set(updateData).where(eq(tracks.id, id));

    const track = await db.query.tracks.findFirst({
      where: eq(tracks.id, id),
      with: {
        room: true,
        schedule: true,
      },
    });

    if (!track) {
      throw new Error("Track not found");
    }

    return transformTrackForStickyNote(track);
  } catch (error) {
    console.error("❌ Track update error:", error);
    throw error;
  }
};
