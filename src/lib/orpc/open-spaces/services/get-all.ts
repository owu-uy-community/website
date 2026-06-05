import { desc } from "drizzle-orm";
import { db } from "../../../db";
import { openSpaces, type OpenSpaceRow } from "../../../db/schema";
import type { OpenSpace } from "../schemas";

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
 * Get all open spaces ordered by creation date
 */
export const getAllOpenSpaces = async (): Promise<OpenSpace[]> => {
  const rows = await db.select().from(openSpaces).orderBy(desc(openSpaces.createdAt));

  return rows.map(transformOpenSpace);
};
