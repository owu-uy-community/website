import { prisma } from "../../../prisma";
import type { GetTrackInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Get a single track by ID
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const getTrackById = async ({ id }: GetTrackInput): Promise<StickyNote> => {
  const track = await prisma.track.findUnique({
    where: { id },
    include: {
      room: true,
      schedule: true,
    },
  });

  if (!track) {
    throw new Error("Track not found");
  }

  return transformTrackForStickyNote(track);
};
