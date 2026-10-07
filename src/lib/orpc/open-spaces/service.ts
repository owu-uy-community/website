import { and, desc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { communities, communityMembers, events, type EventRow } from "../../db/schema";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import type { AdminEventOption, CreateOpenSpaceInput, OpenSpace, UpdateOpenSpaceInput } from "./schemas";

const toOpenSpace = (row: EventRow): OpenSpace => ({
  id: row.id,
  communityId: row.communityId,
  name: row.name,
  description: row.description || undefined,
  startDate: row.startDate.toISOString(),
  endDate: row.endDate.toISOString(),
  isActive: row.isActive,
  autoHighlightEnabled: row.autoHighlightEnabled,
  slug: row.slug,
  timezone: row.timezone,
  eventbriteEventId: row.eventbriteEventId,
  venueMapUrl: row.venueMapUrl,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });
const slugTaken = (slug: string) =>
  new Conflict({ reason: "slug_taken", message: `La comunidad ya tiene un evento con el slug "${slug}"` });

const checkDates = (startDate: Date, endDate: Date) =>
  endDate > startDate
    ? Effect.void
    : Effect.fail(new Invalid({ message: "La fecha de fin tiene que ser posterior a la de inicio" }));

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

export const getEvent = (id: string) =>
  query((db) => db.select().from(events).where(eq(events.id, id))).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(toOpenSpace(row)) : Effect.fail(eventNotFound)))
  );

export const listByCommunity = (communityId: string) =>
  query((db) =>
    db.select().from(events).where(eq(events.communityId, communityId)).orderBy(desc(events.startDate))
  ).pipe(Effect.map((rows) => rows.map(toOpenSpace)));

/**
 * Events with their community, newest first — the event switcher and the
 * staff pages. `userId === null` means site staff (every event); otherwise
 * only events of communities the user belongs to.
 */
export const listEventsForOperator = (userId: string | null) =>
  query((db) => {
    const selection = {
      id: events.id,
      name: events.name,
      slug: events.slug,
      startDate: events.startDate,
      communityId: communities.id,
      communityName: communities.name,
      communitySlug: communities.slug,
    };
    const all = db.select(selection).from(events).innerJoin(communities, eq(communities.id, events.communityId));

    return (
      userId === null
        ? all
        : all.innerJoin(
            communityMembers,
            and(eq(communityMembers.communityId, communities.id), eq(communityMembers.userId, userId))
          )
    ).orderBy(desc(events.startDate));
  }).pipe(
    Effect.map((rows) => rows.map((row): AdminEventOption => ({ ...row, startDate: row.startDate.toISOString() })))
  );

/** The first free slug for `base` in a community: base, base-2, base-3… */
const freeSlug = (communityId: string, base: string) =>
  query((db) => db.select({ slug: events.slug }).from(events).where(eq(events.communityId, communityId))).pipe(
    Effect.map((rows) => {
      const taken = new Set(rows.map((row) => row.slug));
      let candidate = base;
      for (let suffix = 2; taken.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;

      return candidate;
    })
  );

export const createEvent = (input: CreateOpenSpaceInput) =>
  Effect.gen(function* () {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    yield* checkDates(startDate, endDate);

    const [community] = yield* query((db) =>
      db.select({ id: communities.id }).from(communities).where(eq(communities.id, input.communityId))
    );
    if (!community) return yield* new NotFound({ entity: "community", message: "Esa comunidad no existe" });

    const slug = yield* freeSlug(input.communityId, input.slug ?? slugify(input.name));
    const [row] = yield* query((db) =>
      db
        .insert(events)
        .values({
          communityId: input.communityId,
          name: input.name,
          description: input.description || null,
          startDate,
          endDate,
          isActive: input.isActive,
          autoHighlightEnabled: input.autoHighlightEnabled,
          slug,
          timezone: input.timezone,
          eventbriteEventId: input.eventbriteEventId ?? null,
          venueMapUrl: input.venueMapUrl ?? null,
        })
        .returning()
    ).pipe(Effect.catchTag("UniqueViolation", () => Effect.fail(slugTaken(slug))));

    return toOpenSpace(row);
  });

/** Change only the fields that were sent. */
export const updateEvent = (id: string, data: UpdateOpenSpaceInput) =>
  transaction(
    Effect.gen(function* () {
      const current = yield* getEvent(id);
      const startDate = data.startDate === undefined ? undefined : new Date(data.startDate);
      const endDate = data.endDate === undefined ? undefined : new Date(data.endDate);
      yield* checkDates(startDate ?? new Date(current.startDate), endDate ?? new Date(current.endDate));

      const patch: Partial<typeof events.$inferInsert> = {
        ...(data.name === undefined ? {} : { name: data.name }),
        ...(data.description === undefined ? {} : { description: data.description || null }),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
        ...(data.autoHighlightEnabled === undefined ? {} : { autoHighlightEnabled: data.autoHighlightEnabled }),
        ...(data.slug === undefined ? {} : { slug: data.slug }),
        ...(data.timezone === undefined ? {} : { timezone: data.timezone }),
        ...(data.eventbriteEventId === undefined ? {} : { eventbriteEventId: data.eventbriteEventId || null }),
        ...(data.venueMapUrl === undefined ? {} : { venueMapUrl: data.venueMapUrl || null }),
      };
      if (Object.keys(patch).length === 0) return current;

      const [row] = yield* query((db) => db.update(events).set(patch).where(eq(events.id, id)).returning()).pipe(
        Effect.catchTag("UniqueViolation", () => Effect.fail(slugTaken(data.slug ?? current.slug)))
      );

      return toOpenSpace(row);
    })
  );

/** Delete an event with everything that hangs off it (slots, rooms, talks, staff tasks). */
export const deleteEvent = (id: string) =>
  query((db) => db.delete(events).where(eq(events.id, id)).returning()).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(toOpenSpace(row)) : Effect.fail(eventNotFound)))
  );
