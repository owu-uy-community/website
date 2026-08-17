import { eq } from "drizzle-orm";

import { db } from "../../db";
import { communities, events, rooms, schedules, tracks } from "../../db/schema";

export type CommunityScope = {
  communityId: string;
  eventId?: string;
};

type ScopeInput = {
  communityId?: unknown;
  communitySlug?: unknown;
  eventId?: unknown;
  openSpaceId?: unknown;
  trackId?: unknown;
  scheduleId?: unknown;
  roomId?: unknown;
  id?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function scopeFromEventId(eventId: string): Promise<CommunityScope | null> {
  const [event] = await db.select({ communityId: events.communityId }).from(events).where(eq(events.id, eventId));

  return event ? { communityId: event.communityId, eventId } : null;
}

/**
 * Resolve which community (and event, when applicable) a request input refers
 * to. Accepts, in priority order: communityId, communitySlug, eventId /
 * openSpaceId, then row ids that hang off an event (track/schedule/room).
 */
export async function resolveCommunityScope(rawInput: unknown): Promise<CommunityScope | null> {
  const input = (rawInput ?? {}) as ScopeInput;

  const communityId = asString(input.communityId);
  if (communityId) {
    const eventId = asString(input.eventId) ?? asString(input.openSpaceId);

    return { communityId, eventId };
  }

  const communitySlug = asString(input.communitySlug);
  if (communitySlug) {
    const [community] = await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, communitySlug));

    return community ? { communityId: community.id } : null;
  }

  const eventId = asString(input.eventId) ?? asString(input.openSpaceId);
  if (eventId) {
    return scopeFromEventId(eventId);
  }

  const trackId = asString(input.trackId);
  if (trackId) {
    const [track] = await db.select({ openSpaceId: tracks.openSpaceId }).from(tracks).where(eq(tracks.id, trackId));

    return track ? scopeFromEventId(track.openSpaceId) : null;
  }

  const scheduleId = asString(input.scheduleId);
  if (scheduleId) {
    const [schedule] = await db
      .select({ openSpaceId: schedules.openSpaceId })
      .from(schedules)
      .where(eq(schedules.id, scheduleId));

    return schedule ? scopeFromEventId(schedule.openSpaceId) : null;
  }

  const roomId = asString(input.roomId);
  if (roomId) {
    const [room] = await db.select({ openSpaceId: rooms.openSpaceId }).from(rooms).where(eq(rooms.id, roomId));

    return room ? scopeFromEventId(room.openSpaceId) : null;
  }

  return null;
}
