import { prisma } from "../../../prisma";
import type { SwapTracksInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Swap positions of two tracks using atomic transaction with temporary placeholder
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const swapTracks = async ({ trackAId, trackBId }: SwapTracksInput): Promise<StickyNote[]> => {
  if (trackAId === trackBId) {
    throw new Error("Cannot swap a track with itself");
  }

  // Fetch both tracks with their relations in a single query to avoid duplicate fetches
  const [trackA, trackB] = await Promise.all([
    prisma.track.findUnique({
      where: { id: trackAId },
      include: { room: true, schedule: true },
    }),
    prisma.track.findUnique({
      where: { id: trackBId },
      include: { room: true, schedule: true },
    }),
  ]);

  if (!trackA || !trackB) {
    const missingTrack = !trackA ? trackAId : trackBId;
    throw new Error(`Track with id ${missingTrack} not found`);
  }

  // Use single timestamp for all updates to maintain consistency
  const timestamp = new Date();

  // Perform the entire swap operation in a single transaction for atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Create temporary schedule for atomic swap
    const tempSchedule = await tx.schedule.create({
      data: {
        openSpaceId: trackA.openSpaceId,
        startTime: "99:99",
        endTime: "99:99",
        name: "TEMP_SWAP_SCHEDULE",
        date: timestamp,
      },
    });

    // Swap positions using 3-step process with temporary position
    await Promise.all([
      // Step 1: Move trackA to temporary position
      tx.track.update({
        where: { id: trackAId },
        data: {
          scheduleId: tempSchedule.id,
          roomId: trackB.roomId,
          updatedAt: timestamp,
        },
      }),
    ]);

    await Promise.all([
      // Step 2: Move trackB to trackA's original position
      tx.track.update({
        where: { id: trackBId },
        data: {
          scheduleId: trackA.scheduleId,
          roomId: trackA.roomId,
          updatedAt: timestamp,
        },
      }),
      // Step 3: Move trackA to trackB's original position
      tx.track.update({
        where: { id: trackAId },
        data: {
          scheduleId: trackB.scheduleId,
          roomId: trackB.roomId,
          updatedAt: timestamp,
        },
      }),
    ]);

    // Clean up temporary schedule within transaction
    await tx.schedule.delete({
      where: { id: tempSchedule.id },
    });

    // Return updated tracks with their new positions
    return {
      trackA: { ...trackA, scheduleId: trackB.scheduleId, roomId: trackB.roomId, updatedAt: timestamp },
      trackB: { ...trackB, scheduleId: trackA.scheduleId, roomId: trackA.roomId, updatedAt: timestamp },
    };
  });

  // Transform to StickyNote format with swapped positions
  return [
    transformTrackForStickyNote({
      ...result.trackA,
      room: trackB.room,
      schedule: trackB.schedule,
    }),
    transformTrackForStickyNote({
      ...result.trackB,
      room: trackA.room,
      schedule: trackA.schedule,
    }),
  ];
};
