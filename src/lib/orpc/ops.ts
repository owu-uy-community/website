import { desc, eq, and, type SQL } from "drizzle-orm";
import { Effect, Option } from "effect";

import { activity } from "../db/schema";
import { eventChannel } from "../realtime/channels";
import { query } from "./db";
import { CurrentUser, Realtime } from "./services";

/** What changed, so admin screens re-read only that. */
export type OpsTopic =
  | "activity"
  | "incidents"
  | "rooms"
  | "checkins"
  | "rundown"
  | "screens"
  | "comms"
  | "arrivals"
  | "raffle"
  | "survey";

/**
 * Tell an event's admin screens that something changed. A ping on a public channel: the data
 * itself always comes back through a guarded read. Send it after the write commits.
 */
export const opsPing = (eventId: string, topic: OpsTopic) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(eventChannel(eventId, "ops"), topic, {});
  });

export type ActivityEntry = {
  eventId: string | null;
  verb: string;
  entityType: string;
  entityId?: string | null;
  /** One Spanish line in the actor's voice, without the actor: "movió «Testing» a Sala 2". */
  summary: string;
  /** Who did it, when the caller isn't the session (an OAuth callback) */
  actorId?: string;
};

/**
 * Append a line to the activity log, by whoever is calling (a person, Owy, or nobody for
 * webhooks). Inside a `transaction` it commits or rolls back with the change it describes.
 */
export const recordActivity = (entry: ActivityEntry) =>
  Effect.gen(function* () {
    const actor = yield* Effect.serviceOption(CurrentUser);
    yield* query((db) =>
      db.insert(activity).values({
        eventId: entry.eventId,
        verb: entry.verb,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        actorId: entry.actorId ?? (Option.isSome(actor) ? actor.value.id : null),
      })
    );
  });

/** The log of an event (or of one entity in it), newest first. */
export const listActivity = (input: { eventId: string; entityType?: string; entityId?: string; limit: number }) =>
  query((db) => {
    const filters: SQL[] = [eq(activity.eventId, input.eventId)];
    if (input.entityType) filters.push(eq(activity.entityType, input.entityType));
    if (input.entityId) filters.push(eq(activity.entityId, input.entityId));

    return db.query.activity.findMany({
      where: and(...filters),
      with: { actor: { columns: { id: true, name: true, image: true } } },
      orderBy: desc(activity.createdAt),
      limit: input.limit,
    });
  }).pipe(
    Effect.map((rows) =>
      rows.map((row) => ({
        id: row.id,
        verb: row.verb,
        entityType: row.entityType,
        entityId: row.entityId,
        summary: row.summary,
        actor: row.actor,
        createdAt: row.createdAt.toISOString(),
      }))
    )
  );
