import { and, desc, eq } from "drizzle-orm";

import { db } from "../../../db";
import { communities, communityMembers, events } from "../../../db/schema";

export type AdminEventOption = {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  communityId: string;
  communityName: string;
  communitySlug: string;
};

const selection = {
  id: events.id,
  name: events.name,
  slug: events.slug,
  startDate: events.startDate,
  communityId: communities.id,
  communityName: communities.name,
  communitySlug: communities.slug,
};

/**
 * Events with their community, newest first — feeds the event switcher and
 * the staff "Tareas" page. `userId === null` means site staff (every event);
 * otherwise only events of communities the user is a member of.
 */
export const listEventsForOperator = async (userId: string | null): Promise<AdminEventOption[]> => {
  const rows =
    userId === null
      ? await db
          .select(selection)
          .from(events)
          .innerJoin(communities, eq(communities.id, events.communityId))
          .orderBy(desc(events.startDate))
      : await db
          .select(selection)
          .from(events)
          .innerJoin(communities, eq(communities.id, events.communityId))
          .innerJoin(
            communityMembers,
            and(eq(communityMembers.communityId, communities.id), eq(communityMembers.userId, userId))
          )
          .orderBy(desc(events.startDate));

  return rows.map((row) => ({ ...row, startDate: row.startDate.toISOString() }));
};

/** Site-staff view (every event). Kept for existing server callers. */
export const listEventsForAdmin = async (): Promise<AdminEventOption[]> => listEventsForOperator(null);
