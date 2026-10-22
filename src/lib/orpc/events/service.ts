import { and, count, desc, eq, gt, inArray, lt, ne, or } from "drizzle-orm";
import { Effect } from "effect";

import { similarity } from "../../calendar/score";
import { communities, communityMembers, events, user, type EventRow } from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { conflictHeadsUpEmail, holdExpiringEmail } from "../../email/templates";
import { dayKey, montevideoIso, shortWhen } from "../../community/time";
import { LEGACY_COMMUNITY_SLUG } from "../../tenant";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { freeSlug, slugify } from "../open-spaces/service";
import { recordActivity } from "../ops";
import { CommunityScope } from "../services";
import type { HoldInput, OrganizerEvent } from "./schemas";

/** How long a date stays reserved; renewing starts the count again. */
export const HOLD_DAYS = 14;
/** Live holds a community can keep at once: enough to compare dates, not to squat a season. */
export const MAX_HOLDS = 8;
const DAY_MS = 86_400_000;

export const toOrganizerEvent = (row: EventRow): OrganizerEvent => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  status: row.status,
  startDate: row.startDate.toISOString(),
  endDate: row.endDate.toISOString(),
  heldUntil: row.heldUntil?.toISOString() ?? null,
  dateChosen: row.status !== "draft" || row.heldUntil !== null,
  registration: row.registration,
  capacity: row.capacity,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});

const notFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

/** Who organizes a community (editor and up): who hears about holds and clashes. */
export const organizerEmails = (communityId: string) =>
  query((db) =>
    db
      .select({ email: user.email })
      .from(communityMembers)
      .innerJoin(user, eq(user.id, communityMembers.userId))
      .where(
        and(eq(communityMembers.communityId, communityId), inArray(communityMembers.role, ["owner", "admin", "editor"]))
      )
  ).pipe(Effect.map((rows) => rows.map((row) => row.email)));

/** The community's events, drafts included, newest first. */
export const list = (communityId: string) =>
  query((db) =>
    db.select().from(events).where(eq(events.communityId, communityId)).orderBy(desc(events.startDate))
  ).pipe(Effect.map((rows) => rows.map(toOrganizerEvent)));

const draftOf = (communityId: string, eventId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
        .for("update")
    );
    if (!row) return yield* notFound;
    if (row.status !== "draft") {
      return yield* new Conflict({
        reason: "not_draft",
        message: "Ese evento ya está publicado: la fecha se cambia desde el evento",
      });
    }

    return row;
  });

/**
 * Tell organizers with a similar audience that this date was taken the same day as theirs (an event
 * or a hold), once per date. Meetups only on the meetup-bot feed have nobody here to tell.
 */
const headsUp = (row: EventRow) =>
  Effect.gen(function* () {
    const day = dayKey(row.startDate);
    const dayStart = new Date(montevideoIso(`${day}T00:00`));
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const [ours] = yield* query((db) =>
      db
        .select({ name: communities.name, slug: communities.slug, topics: communities.topics })
        .from(communities)
        .where(eq(communities.id, row.communityId))
    );
    if (!ours) return 0;
    const ourTopics = row.topics.length > 0 ? row.topics : ours.topics;
    const sameDay = yield* query((db) =>
      db
        .select({
          id: events.id,
          name: events.name,
          status: events.status,
          topics: events.topics,
          communityId: communities.id,
          communitySlug: communities.slug,
          communityTopics: communities.topics,
        })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(
          and(
            ne(events.communityId, row.communityId),
            lt(events.startDate, dayEnd),
            gt(events.endDate, dayStart),
            or(eq(events.status, "published"), and(eq(events.status, "draft"), gt(events.heldUntil, new Date())))
          )
        )
    );
    const told = new Set<string>();
    for (const other of sameDay) {
      const sim = similarity(ourTopics, {
        isOwu: ours.slug === LEGACY_COMMUNITY_SLUG,
        topics: other.topics.length > 0 ? other.topics : other.communityTopics,
      });
      if (sim < 0.5 || told.has(other.communityId)) continue;
      told.add(other.communityId);
      for (const to of yield* organizerEmails(other.communityId)) {
        yield* enqueueEmail({
          kind: "conflict_heads_up",
          to,
          // Per community pair and day, not per hold: more holds that day don't mean more email
          dedupeKey: `conflict_heads_up:${row.communityId}:${other.communityId}:${day}:${to}`,
          ...conflictHeadsUpEmail({
            community: ours.name,
            when: shortWhen(row.startDate),
            theirs: other.status === "draft" ? null : other.name,
            calendarPath: `/organizar/panel/${other.communitySlug}/calendario?dia=${day}`,
          }),
        });
      }
    }

    return told.size;
  });

/**
 * Reserve a date for 14 days: date an existing draft, or make one for it. Every organizer sees the
 * hold on the calendar (another community's, without its title), and similar communities with
 * something that day get an email.
 */
export const hold = (input: HoldInput) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const startDate = new Date(montevideoIso(`${input.day}T${input.startTime}`));
      if (startDate.getTime() < Date.now()) return yield* new Invalid({ message: "Esa fecha ya pasó" });
      const endDate = new Date(startDate.getTime() + input.durationMin * 60_000);
      const heldUntil = new Date(Date.now() + HOLD_DAYS * DAY_MS);

      let row: EventRow;
      if (input.eventId) {
        yield* draftOf(communityId, input.eventId);
        [row] = yield* query((db) =>
          db
            .update(events)
            .set({ startDate, endDate, heldUntil, ...(input.title ? { name: input.title } : {}) })
            .where(eq(events.id, input.eventId ?? ""))
            .returning()
        );
      } else {
        const [{ live }] = yield* query((db) =>
          db
            .select({ live: count() })
            .from(events)
            .where(
              and(eq(events.communityId, communityId), eq(events.status, "draft"), gt(events.heldUntil, new Date()))
            )
        );
        if (live >= MAX_HOLDS) {
          return yield* new Conflict({
            reason: "too_many_holds",
            message: `Ya tenés ${MAX_HOLDS} fechas reservadas: liberá alguna para reservar otra`,
          });
        }
        const name = input.title ?? "Evento sin título";
        const slug = yield* freeSlug(communityId, slugify(name));
        [row] = yield* query((db) =>
          db
            .insert(events)
            .values({ name, slug, communityId, startDate, endDate, heldUntil, status: "draft" })
            .returning()
        );
      }

      const told = yield* headsUp(row);
      yield* recordActivity({
        eventId: row.id,
        verb: "event.held",
        entityType: "event",
        entityId: row.id,
        summary: `reservó el ${shortWhen(startDate)} por ${HOLD_DAYS} días`,
      });

      return { ...toOrganizerEvent(row), headsUp: told };
    })
  );

/** Give a reserved date back: the draft stays, without a date. */
export const release = (eventId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      yield* draftOf(communityId, eventId);
      const [row] = yield* query((db) =>
        db.update(events).set({ heldUntil: null }).where(eq(events.id, eventId)).returning()
      );
      yield* recordActivity({
        eventId,
        verb: "event.released",
        entityType: "event",
        entityId: eventId,
        summary: "liberó la fecha reservada",
      });

      return toOrganizerEvent(row);
    })
  );

/** Delete a draft. Published events are cancelled, never deleted. */
export const remove = (eventId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      yield* draftOf(communityId, eventId);
      yield* query((db) => db.delete(events).where(eq(events.id, eventId)));

      return { id: eventId };
    })
  );

/** Holds ending within two days: their organizers get one reminder per hold (a renewal sends a new one). */
export const remindExpiringHolds = Effect.gen(function* () {
  const now = new Date();
  const soon = yield* query((db) =>
    db
      .select({
        id: events.id,
        name: events.name,
        startDate: events.startDate,
        heldUntil: events.heldUntil,
        communityId: communities.id,
        communitySlug: communities.slug,
        communityName: communities.name,
      })
      .from(events)
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(
        and(
          eq(events.status, "draft"),
          gt(events.heldUntil, now),
          lt(events.heldUntil, new Date(now.getTime() + 2 * DAY_MS))
        )
      )
  );
  let queued = 0;
  for (const hold of soon) {
    if (!hold.heldUntil) continue;
    for (const to of yield* organizerEmails(hold.communityId)) {
      yield* enqueueEmail({
        kind: "hold_expiring",
        to,
        dedupeKey: `hold_expiring:${hold.id}:${hold.heldUntil.getTime()}:${to}`,
        ...holdExpiringEmail({
          community: hold.communityName,
          title: hold.name,
          when: shortWhen(hold.startDate),
          until: shortWhen(hold.heldUntil),
          panelPath: `/organizar/panel/${hold.communitySlug}`,
        }),
      });
      queued += 1;
    }
  }

  return { holds: soon.length, queued };
});
