import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { tracks } from "../../../db/schema";
import type { DeleteTrackInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Delete a track by ID
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const deleteTrack = async ({ id }: DeleteTrackInput): Promise<StickyNote> => {
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

  await db.delete(tracks).where(eq(tracks.id, id));

  return transformTrackForStickyNote(track);
};
