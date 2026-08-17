import { desc, eq } from "drizzle-orm";

import { db } from "../../../db";
import { events, type EventRow } from "../../../db/schema";
import type { OpenSpace } from "../schemas";

const transformOpenSpace = (event: EventRow): OpenSpace => ({
  ...event,
  startDate: event.startDate.toISOString(),
  endDate: event.endDate.toISOString(),
  description: event.description || undefined,
  createdAt: event.createdAt.toISOString(),
  updatedAt: event.updatedAt.toISOString(),
});

/**
 * List a community's events, newest first.
 */
export const getOpenSpacesByCommunity = async (communityId: string): Promise<OpenSpace[]> => {
  const rows = await db.select().from(events).where(eq(events.communityId, communityId)).orderBy(desc(events.startDate));

  return rows.map(transformOpenSpace);
};
