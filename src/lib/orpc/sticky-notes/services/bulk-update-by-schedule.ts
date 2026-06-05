import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { schedules, tracks } from "../../../db/schema";
import type { BulkUpdateTracksByScheduleInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Bulk update all tracks for a schedule when the schedule time changes
 * Uses a database transaction for atomicity - all updates succeed or all fail
 * Returns updated tracks in StickyNote format
 */
export const bulkUpdateTracksBySchedule = async (input: BulkUpdateTracksByScheduleInput): Promise<StickyNote[]> => {
  const { scheduleId, newTimeSlot, newScheduleId } = input;

  // Verify the schedule exists
  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  // If a new schedule ID is provided, verify it exists
  if (newScheduleId && newScheduleId !== scheduleId) {
    const [newSchedule] = await db.select().from(schedules).where(eq(schedules.id, newScheduleId)).limit(1);

    if (!newSchedule) {
      throw new Error("New schedule not found");
    }
  }

  const shouldReassign = Boolean(newScheduleId && newScheduleId !== scheduleId);

  // Use a transaction to ensure all tracks are updated atomically
  // If any update fails, all updates are rolled back
  const updatedTracks = await db.transaction(async (tx) => {
    // Find all tracks for this schedule (with relations for the transform)
    const tracksToUpdate = await tx.query.tracks.findMany({
      where: eq(tracks.scheduleId, scheduleId),
      with: {
        room: true,
        schedule: true,
      },
    });

    console.log(`🔄 [Bulk Update] Updating ${tracksToUpdate.length} tracks for schedule ${scheduleId}`);

    if (tracksToUpdate.length === 0) {
      console.log(`ℹ️ [Bulk Update] No tracks found for schedule ${scheduleId}`);
      return [];
    }

    const timestamp = new Date();

    // Update all tracks in the transaction
    for (const track of tracksToUpdate) {
      await tx
        .update(tracks)
        .set({
          updatedAt: timestamp,
          // Only update scheduleId if a new one is provided and different.
          // timeSlot is not stored in the DB; it is computed from the schedule
          // (and overridden with newTimeSlot below).
          ...(shouldReassign && newScheduleId ? { scheduleId: newScheduleId } : {}),
        })
        .where(eq(tracks.id, track.id));
    }

    console.log(`✅ [Bulk Update] Successfully updated ${tracksToUpdate.length} tracks`);

    // Return the tracks with the applied changes, reusing the fetched relations
    return tracksToUpdate.map((track) => ({
      ...track,
      updatedAt: timestamp,
      ...(shouldReassign && newScheduleId ? { scheduleId: newScheduleId } : {}),
    }));
  });

  // Transform to StickyNote format with the new timeSlot
  return updatedTracks.map((track) => {
    // Override the timeSlot with the new value since the schedule might not be updated yet
    const stickyNote = transformTrackForStickyNote(track);
    return {
      ...stickyNote,
      timeSlot: newTimeSlot,
    };
  });
};
