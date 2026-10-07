import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import { communities, communityMembers, events, rooms, schedules, tracks, type CommunityRoleValue } from "../db/schema";
import { query } from "./db";
import type { ForeignKeyViolation, UniqueViolation } from "./errors";
import type { Database } from "./services";

export type ScopeInput = {
  communityId?: unknown;
  communitySlug?: unknown;
  eventId?: unknown;
  openSpaceId?: unknown;
  trackId?: unknown;
  scheduleId?: unknown;
  roomId?: unknown;
};

export type ResolvedScope = { communityId: string; eventId?: string };

const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined);

const communityOfEvent = (eventId: string) =>
  query((db) => db.select({ communityId: events.communityId }).from(events).where(eq(events.id, eventId))).pipe(
    Effect.map(([event]) => (event ? { communityId: event.communityId, eventId } : null))
  );

/**
 * Which community (and event) a request is about, from its validated input:
 * communityId / communitySlug, then eventId / openSpaceId, then a row that
 * hangs off an event (track, slot, room). Null when nothing resolves — or when
 * the input names an event outside the community it names.
 */
export const resolveScope = (
  input: ScopeInput
): Effect.Effect<ResolvedScope | null, UniqueViolation | ForeignKeyViolation, Database> =>
  Effect.gen(function* () {
    const eventId = text(input.eventId) ?? text(input.openSpaceId);
    const communityId = text(input.communityId);

    if (communityId) {
      if (!eventId) return { communityId };
      const scope = yield* communityOfEvent(eventId);

      return scope?.communityId === communityId ? scope : null;
    }

    const communitySlug = text(input.communitySlug);
    if (communitySlug) {
      const [community] = yield* query((db) =>
        db.select({ id: communities.id }).from(communities).where(eq(communities.slug, communitySlug))
      );

      return community ? { communityId: community.id } : null;
    }

    if (eventId) return yield* communityOfEvent(eventId);

    for (const [id, table] of [
      [text(input.trackId), tracks],
      [text(input.scheduleId), schedules],
      [text(input.roomId), rooms],
    ] as const) {
      if (!id) continue;
      const [row] = yield* query((db) => db.select({ eventId: table.openSpaceId }).from(table).where(eq(table.id, id)));

      return row ? yield* communityOfEvent(row.eventId) : null;
    }

    return null;
  });

export const ROLE_RANK: Record<CommunityRoleValue, number> = { member: 0, editor: 1, admin: 2, owner: 3 };

/** The caller's role in a community, if they belong to it. */
export const memberRole = (communityId: string, userId: string) =>
  query((db) =>
    db
      .select({ role: communityMembers.role })
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
  ).pipe(Effect.map(([membership]) => membership?.role ?? null));
