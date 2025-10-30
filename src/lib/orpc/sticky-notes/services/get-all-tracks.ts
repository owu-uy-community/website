import { prisma } from "../../../prisma";
import type { StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Get all tracks ordered by creation date
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const getAllTracks = async (): Promise<StickyNote[]> => {
  const tracks = await prisma.track.findMany({
    include: {
      room: true,
      schedule: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return tracks.map(transformTrackForStickyNote);
};
