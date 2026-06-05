import { db } from "../../../db";
import type { StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Get all tracks ordered by creation date
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const getAllTracks = async (): Promise<StickyNote[]> => {
  const tracks = await db.query.tracks.findMany({
    with: {
      room: true,
      schedule: true,
    },
    orderBy: (tracks, { desc }) => [desc(tracks.createdAt)],
  });

  return tracks.map(transformTrackForStickyNote);
};
