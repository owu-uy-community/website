import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { openSpaces, type OpenSpaceRow } from "../../../db/schema";
import type { GetOpenSpaceInput, OpenSpace } from "../schemas";

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
 * Get a single open space by ID
 */
export const getOpenSpaceById = async ({ id }: GetOpenSpaceInput): Promise<OpenSpace> => {
  const [openSpace] = await db.select().from(openSpaces).where(eq(openSpaces.id, id)).limit(1);

  if (!openSpace) {
    throw new Error("OpenSpace not found");
  }

  return transformOpenSpace(openSpace);
};
