import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { openSpaces, type OpenSpaceRow } from "../../../db/schema";
import type { DeleteOpenSpaceInput, OpenSpace } from "../schemas";

/**
 * Transform database open space to API format
 */
const transformOpenSpace = (openSpace: OpenSpaceRow): OpenSpace => ({
  ...openSpace,
  startDate: openSpace.startDate.toISOString(),
  endDate: openSpace.endDate.toISOString(),
  description: openSpace.description || undefined,
  createdAt: openSpace.createdAt.toISOString(),
  updatedAt: openSpace.updatedAt.toISOString(),
});

/**
 * Delete an open space by ID
 * Note: This will cascade delete all related rooms, schedules, and tracks
 */
export const deleteOpenSpace = async ({ id }: DeleteOpenSpaceInput): Promise<OpenSpace> => {
  const [openSpace] = await db.delete(openSpaces).where(eq(openSpaces.id, id)).returning();

  if (!openSpace) {
    throw new Error("OpenSpace not found");
  }

  return transformOpenSpace(openSpace);
};
