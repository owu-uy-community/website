import { and, eq } from "drizzle-orm";

import { db } from "../../../db";
import { rooms } from "../../../db/schema";
import type { ReorderRoomsInput } from "../schemas";

/**
 * Persist a new column order for an event's rooms. Ids not present in
 * orderedIds keep their relative position after the listed ones.
 */
export const reorderRooms = async ({ openSpaceId, orderedIds }: ReorderRoomsInput): Promise<{ success: true }> => {
  await db.transaction(async (tx) => {
    for (const [index, roomId] of orderedIds.entries()) {
      await tx
        .update(rooms)
        .set({ sortOrder: index })
        .where(and(eq(rooms.id, roomId), eq(rooms.openSpaceId, openSpaceId)));
    }
  });

  return { success: true };
};
