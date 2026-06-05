import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { schedules, tracks } from "../../../db/schema";
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

  // Fetch both tracks with their relations in a single round-trip to avoid duplicate fetches
  const [trackA, trackB] = await Promise.all([
    db.query.tracks.findFirst({ where: eq(tracks.id, trackAId), with: { room: true, schedule: true } }),
    db.query.tracks.findFirst({ where: eq(tracks.id, trackBId), with: { room: true, schedule: true } }),
  ]);

  if (!trackA || !trackB) {
    const missingTrack = !trackA ? trackAId : trackBId;
    throw new Error(`Track with id ${missingTrack} not found`);
  }

  // Use single timestamp for all updates to maintain consistency
  const timestamp = new Date();

  // Perform the entire swap operation in a single transaction for atomicity
  const result = await db.transaction(async (tx) => {
    // Create temporary schedule for atomic swap
    const [tempSchedule] = await tx
      .insert(schedules)
      .values({
        openSpaceId: trackA.openSpaceId,
        startTime: "99:99",
        endTime: "99:99",
        name: "TEMP_SWAP_SCHEDULE",
        date: timestamp,
      })
      .returning();

    // Swap positions using a 3-step process with a temporary slot.
    // Steps run sequentially so each target slot is free before a track
    // moves into it (the unique (scheduleId, roomId) constraint requires it).

    // Step 1: Move trackA to the temporary schedule (frees its original slot)
    await tx
      .update(tracks)
      .set({ scheduleId: tempSchedule.id, roomId: trackB.roomId, updatedAt: timestamp })
      .where(eq(tracks.id, trackAId));

    // Step 2: Move trackB into trackA's original slot
    await tx
      .update(tracks)
      .set({ scheduleId: trackA.scheduleId, roomId: trackA.roomId, updatedAt: timestamp })
      .where(eq(tracks.id, trackBId));

    // Step 3: Move trackA into trackB's original slot
    await tx
      .update(tracks)
      .set({ scheduleId: trackB.scheduleId, roomId: trackB.roomId, updatedAt: timestamp })
      .where(eq(tracks.id, trackAId));

    // Clean up temporary schedule within transaction
    await tx.delete(schedules).where(eq(schedules.id, tempSchedule.id));

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
