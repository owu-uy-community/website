import { eq } from "drizzle-orm";

import { db } from "../../../db";
import { tracks } from "../../../db/schema";
import type { StickyNote } from "../schemas";
import { transformTrackForStickyNote } from "./transforms";

/**
 * Get an event's tracks ordered by creation date.
 * Returns StickyNote format with readable room names and time slots for UI.
 * Always event-scoped — the unscoped variant leaked every tenant's tracks.
 */
export const getTracksForEvent = async (openSpaceId: string): Promise<StickyNote[]> => {
  const rows = await db.query.tracks.findMany({
    where: eq(tracks.openSpaceId, openSpaceId),
    with: {
      room: true,
      schedule: true,
    },
    orderBy: (trackRows, { desc }) => [desc(trackRows.createdAt)],
  });

  return rows.map(transformTrackForStickyNote);
};
