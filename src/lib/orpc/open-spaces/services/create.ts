import { and, eq } from "drizzle-orm";

import { db } from "../../../db";
import { communities, events, type EventRow } from "../../../db/schema";
import type { CreateOpenSpaceInput, OpenSpace } from "../schemas";

/**
 * Transform database event to API format
 */
const transformOpenSpace = (event: EventRow): OpenSpace => ({
  ...event,
  startDate: event.startDate.toISOString(),
  endDate: event.endDate.toISOString(),
  description: event.description || undefined,
  createdAt: event.createdAt.toISOString(),
  updatedAt: event.updatedAt.toISOString(),
});

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "evento"
  );
}

/**
 * Create a new event (open space) inside a community
 */
export const createOpenSpace = async (input: CreateOpenSpaceInput): Promise<OpenSpace> => {
  // Parse dates once for validation and usage
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);

  // Validate date range
  if (endDate <= startDate) {
    throw new Error("End date must be after start date");
  }

  const [community] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.id, input.communityId));
  if (!community) {
    throw new Error("Community not found");
  }

  // Resolve a unique slug within the community
  const base = input.slug ?? slugify(input.name);
  let slug = base;
  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.communityId, input.communityId), eq(events.slug, slug)));
    if (!existing) break;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  const [event] = await db
    .insert(events)
    .values({
      name: input.name,
      description: input.description || null,
      startDate,
      endDate,
      isActive: input.isActive,
      communityId: input.communityId,
      slug,
      timezone: input.timezone,
      eventbriteEventId: input.eventbriteEventId ?? null,
      venueMapUrl: input.venueMapUrl ?? null,
    })
    .returning();

  return transformOpenSpace(event);
};
