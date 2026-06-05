import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { tracks } from "../../../db/schema";
import type { GetTrackInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Get a single track by ID
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const getTrackById = async ({ id }: GetTrackInput): Promise<StickyNote> => {
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
};
