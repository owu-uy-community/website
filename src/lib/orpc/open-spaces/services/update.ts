import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { openSpaces, type OpenSpaceRow } from "../../../db/schema";
import type { UpdateOpenSpaceInput, OpenSpace } from "../schemas";

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
 * Update an existing open space
 */
export const updateOpenSpace = async ({ id, data }: { id: string; data: UpdateOpenSpaceInput }): Promise<OpenSpace> => {
  // Check if open space exists
  const [currentOpenSpace] = await db.select().from(openSpaces).where(eq(openSpaces.id, id)).limit(1);

  if (!currentOpenSpace) {
    throw new Error("OpenSpace not found");
  }

  // Parse and validate dates if provided
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (data.startDate !== undefined) {
    startDate = new Date(data.startDate);
  }

  if (data.endDate !== undefined) {
    endDate = new Date(data.endDate);
  }

  // Validate date range if both dates are being updated or one is updated relative to existing
  const finalStartDate = startDate || currentOpenSpace.startDate;
  const finalEndDate = endDate || currentOpenSpace.endDate;

  if (finalEndDate <= finalStartDate) {
    throw new Error("End date must be after start date");
  }

  // Use single timestamp for consistency
  const timestamp = new Date();

  // Build update data object with only provided fields
  const updateData: Partial<typeof openSpaces.$inferInsert> = {
    updatedAt: timestamp,
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description || null }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    ...(data.isActive !== undefined && { isActive: data.isActive }),
    ...(data.autoHighlightEnabled !== undefined && { autoHighlightEnabled: data.autoHighlightEnabled }),
  };

  const [openSpace] = await db.update(openSpaces).set(updateData).where(eq(openSpaces.id, id)).returning();

  return transformOpenSpace(openSpace);
};
