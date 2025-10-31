import { prisma } from "../../../prisma";
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
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  // If a new schedule ID is provided, verify it exists
  if (newScheduleId && newScheduleId !== scheduleId) {
    const newSchedule = await prisma.schedule.findUnique({
      where: { id: newScheduleId },
    });

    if (!newSchedule) {
      throw new Error("New schedule not found");
    }
  }

  // Use a transaction to ensure all tracks are updated atomically
  // If any update fails, all updates are rolled back
  const updatedTracks = await prisma.$transaction(async (tx) => {
    // Find all tracks for this schedule
    const tracksToUpdate = await tx.track.findMany({
      where: {
        scheduleId: scheduleId,
      },
      include: {
        room: true,
        schedule: true,
      },
    });

    console.log(`🔄 [Bulk Update] Updating ${tracksToUpdate.length} tracks for schedule ${scheduleId}`);

    if (tracksToUpdate.length === 0) {
      console.log(`ℹ️ [Bulk Update] No tracks found for schedule ${scheduleId}`);
      return [];
    }

    // Update all tracks in the transaction
    const updatePromises = tracksToUpdate.map((track) =>
      tx.track.update({
        where: { id: track.id },
        data: {
          // Only update scheduleId if a new one is provided and different
          ...(newScheduleId && newScheduleId !== scheduleId && { scheduleId: newScheduleId }),
          // Note: We don't store timeSlot in DB, it's computed from the schedule
          // The timeSlot will automatically reflect the new schedule times
        },
        include: {
          room: true,
          schedule: true,
        },
      })
    );

    // Wait for all updates to complete within the transaction
    const results = await Promise.all(updatePromises);

    console.log(`✅ [Bulk Update] Successfully updated ${results.length} tracks`);

    return results;
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
