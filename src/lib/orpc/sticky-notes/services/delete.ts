import { prisma } from "../../../prisma";
import type { DeleteTrackInput, StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Delete a track by ID
 * Returns StickyNote format with readable room names and time slots for UI
 */
export const deleteTrack = async ({ id }: DeleteTrackInput): Promise<StickyNote> => {
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

  await prisma.track.delete({
    where: { id },
  });

  return transformTrackForStickyNote(track);
};
