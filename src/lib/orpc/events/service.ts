import { createHash } from "node:crypto";

import { and, asc, count, desc, eq, gt, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { Effect, Option } from "effect";

import { similarity } from "../../calendar/score";
import {
  attendees,
  communities,
  communityMembers,
  events,
  outboundMessages,
  schedules,
  user,
  venues,
  type EventRow,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, conflictHeadsUpEmail, eventMessageEmail, holdExpiringEmail } from "../../email/templates";
import { dayKey, montevideoIso, shortWhen } from "../../community/time";
import { announcementText, slackSafe } from "../../organizar/announcement";
import { issues, UNTITLED } from "../../organizar/steps";
import { eventPagePath, refreshEvent } from "../../revalidate";
import { owyChannels } from "../../owy/messaging";
import { LEGACY_COMMUNITY_SLUG } from "../../tenant";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import * as Comms from "../comms/service";
import { notifyFollowers } from "../communities/follow";
import { acceptedCohosts, cohostsOf, inviteCohosts, setCohosts } from "./cohosts";
import { queuePush } from "../integrations/service";
import { freeSlug, slugify } from "../open-spaces/service";
import { recordActivity } from "../ops";
import { memberRole, ROLE_RANK } from "../scope";
import { notifyCancelled, seatsChanged } from "../rsvps/service";
import { CommunityScope, CurrentUser, liveServices } from "../services";
import type { DraftPatch, EditableEvent, HoldInput, OrganizerEvent, PublicEvent } from "./schemas";

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

/** "Ana González Pérez" → "Ana G.": enough to recognize someone, not to look them up. */
export const shortName = (name: string) => {
  const [first = "", second] = name.trim().split(/\s+/);

  return second ? `${first} ${second[0].toUpperCase()}.` : first;
};

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

// ---------------------------------------------------------------------------
// The wizard: create, edit (autosave), publish, cancel
// ---------------------------------------------------------------------------

const PROVISIONAL_DAYS = 28;

const editableOf = (eventId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({ event: events, communitySlug: communities.slug, venue: venues })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(eq(events.id, eventId))
    );
    if (!row) return yield* notFound;
    const { event, venue } = row;

    return {
      ...toOrganizerEvent(event),
      communitySlug: row.communitySlug,
      summary: event.summary,
      description: event.description,
      format: event.format,
      topics: event.topics,
      mode: event.mode,
      venueId: event.venueId,
      venue: venue
        ? { id: venue.id, name: venue.name, neighbourhood: venue.neighbourhood, address: venue.address }
        : null,
      placeName: event.placeName,
      placeAddress: event.placeAddress,
      venueMapUrl: event.venueMapUrl,
      onlineUrl: event.onlineUrl,
      registrationUrl: event.registrationUrl,
      approval: event.approval,
      waitlist: event.waitlist,
      guestsAllowed: event.guestsAllowed,
      rsvpClosesAt: event.rsvpClosesAt?.toISOString() ?? null,
      questions: event.questions,
      externalLinks: event.externalLinks,
      sizeBucket: event.sizeBucket,
      needs: event.needs,
      talks: event.talks,
      announcement: event.announcement,
      announceChannels: { slack: owyChannels().slack, telegram: owyChannels().telegram },
      publishAt: event.publishAt?.toISOString() ?? null,
      cohosts: yield* cohostsOf(event.id),
    } satisfies EditableEvent;
  });

/** One event of the scoped community, as the wizard edits it. */
export const get = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    if (!(yield* belongs(eventId, communityId))) return yield* notFound;

    return yield* editableOf(eventId);
  });

const belongs = (eventId: string, communityId: string) =>
  query((db) =>
    db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
  ).pipe(Effect.map((rows) => rows.length > 0));

/**
 * A new draft, with a provisional date four weeks out (reserving one makes it real), optionally
 * starting from a previous event's texts and settings. A mutation, never a GET: prefetching a
 * link must not make drafts.
 */
export const createDraft = (input: { title?: string; copyFrom?: string }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const [source] = input.copyFrom
        ? yield* query((db) =>
            db
              .select()
              .from(events)
              .where(and(eq(events.id, input.copyFrom ?? ""), eq(events.communityId, communityId)))
          )
        : [];
      const startDate = new Date(Date.now() + PROVISIONAL_DAYS * DAY_MS);
      startDate.setUTCHours(22, 0, 0, 0);
      const length = source ? source.endDate.getTime() - source.startDate.getTime() : 2 * 3_600_000;
      const name = input.title ?? (source ? source.name : UNTITLED);
      const slug = yield* freeSlug(communityId, slugify(name === UNTITLED ? "borrador" : name));
      const [row] = yield* query((db) =>
        db
          .insert(events)
          .values({
            communityId,
            name,
            slug,
            status: "draft",
            startDate,
            endDate: new Date(startDate.getTime() + length),
            ...(source
              ? {
                  summary: source.summary,
                  description: source.description,
                  format: source.format,
                  topics: source.topics,
                  mode: source.mode,
                  registration: source.registration,
                  approval: source.approval,
                  capacity: source.capacity,
                  waitlist: source.waitlist,
                  guestsAllowed: source.guestsAllowed,
                  questions: source.questions,
                  sizeBucket: source.sizeBucket,
                  needs: source.needs,
                }
              : { registration: "owu" as const }),
          })
          .returning({ id: events.id })
      );
      yield* recordActivity({
        eventId: row.id,
        verb: "event.drafted",
        entityType: "event",
        entityId: row.id,
        summary: source ? `empezó un evento a partir de «${source.name}»` : "empezó un evento nuevo",
      });

      return yield* editableOf(row.id);
    })
  );

/**
 * Autosave: apply what changed, unless someone else saved since this editor loaded (a 409 the
 * panel shows as "otra persona editó"). Published events can move their date; attendees hear
 * about date or place changes (the calendar invite's sequence goes up).
 */
export const save = (input: { eventId: string; expectedUpdatedAt: string; patch: DraftPatch }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const [row] = yield* query((db) =>
        db
          .select()
          .from(events)
          .where(and(eq(events.id, input.eventId), eq(events.communityId, communityId)))
          .for("update")
      );
      if (!row) return yield* notFound;
      if (row.status === "cancelled") {
        return yield* new Conflict({ reason: "cancelled", message: "El evento está cancelado: ya no se edita" });
      }
      if (row.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        return yield* new Conflict({
          reason: "stale",
          message: "Otra persona editó este evento: recargá para ver sus cambios",
        });
      }

      // One sign-up system per event: a published one doesn't move its people to or from Eventbrite
      const { registration } = input.patch;
      if (
        row.status === "published" &&
        registration !== undefined &&
        registration !== row.registration &&
        (registration === "eventbrite" || row.registration === "eventbrite")
      ) {
        return yield* new Conflict({
          reason: "eventbrite",
          message:
            "Ya publicado, las inscripciones no pasan a Eventbrite ni vuelven: una sola forma de anotarse por evento",
        });
      }

      const { schedule, rsvpClosesAt, cohosts, ...fields } = input.patch;
      const moved =
        row.status === "published" && schedule
          ? (() => {
              const start = new Date(montevideoIso(`${schedule.day}T${schedule.startTime}`));
              return { startDate: start, endDate: new Date(start.getTime() + schedule.durationMin * 60_000) };
            })()
          : null;
      const placeChanged =
        row.status === "published" &&
        ((fields.placeName !== undefined && fields.placeName !== row.placeName) ||
          (fields.placeAddress !== undefined && fields.placeAddress !== row.placeAddress) ||
          (fields.mode !== undefined && fields.mode !== row.mode));
      const dateChanged = moved !== null && moved.startDate.getTime() !== row.startDate.getTime();

      const [updated] = yield* query((db) =>
        db
          .update(events)
          .set({
            ...fields,
            // Always something to set (a save of co-hosts only still moves the version)
            updatedAt: new Date(),
            ...(rsvpClosesAt !== undefined ? { rsvpClosesAt: rsvpClosesAt ? new Date(rsvpClosesAt) : null } : {}),
            ...moved,
            ...(dateChanged || placeChanged ? { icsSequence: row.icsSequence + 1 } : {}),
          })
          .where(eq(events.id, row.id))
          .returning()
      );
      // After the update, so an invitation going out carries the name and date just saved
      if (cohosts) yield* setCohosts(updated ?? row, cohosts);
      if (dateChanged && moved) {
        yield* recordActivity({
          eventId: row.id,
          verb: "event.rescheduled",
          entityType: "event",
          entityId: row.id,
          summary: `movió el evento al ${shortWhen(moved.startDate)}`,
        });
      }
      if (row.status === "published" && fields.capacity !== undefined && fields.capacity !== row.capacity) {
        yield* recordActivity({
          eventId: row.id,
          verb: "event.capacity",
          entityType: "event",
          entityId: row.id,
          summary: fields.capacity === null ? "sacó el límite de lugares" : `cambió el cupo a ${fields.capacity}`,
        });
        // More room: the waitlist moves up now, not when someone leaves
        if (fields.capacity === null || (row.capacity !== null && fields.capacity > row.capacity)) {
          yield* seatsChanged(row.id);
        }
      }

      yield* queuePush(row);
      const saved = yield* editableOf(row.id);
      if (saved.status !== "draft") refreshEvent(saved.communitySlug, saved.slug);

      return saved;
    })
  );

/**
 * Publish a draft: everything required in place (the same checks the wizard shows), the address
 * from its final name, the hold gone (it's an event now), similar communities told.
 */
export const publish = (eventId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const [row] = yield* query((db) =>
        db
          .select()
          .from(events)
          .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
          .for("update")
      );
      if (!row) return yield* notFound;
      if (row.status !== "draft") {
        return yield* new Conflict({ reason: "not_draft", message: "Ese evento ya está publicado" });
      }
      const current = yield* editableOf(eventId);
      const missing = issues(current).filter((issue) => issue.level === "required");
      if (missing.length > 0) {
        return yield* new Invalid({
          message: `Antes de publicar: ${missing.map((issue) => issue.text.toLowerCase()).join(", ")}`,
          issues: missing,
        });
      }

      const taken = new Set(
        (yield* query((db) =>
          db
            .select({ slug: events.slug })
            .from(events)
            .where(and(eq(events.communityId, communityId), ne(events.id, eventId)))
        )).map((other) => other.slug)
      );
      const base = slugify(row.name);
      let slug = base;
      for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${base}-${suffix}`;

      const [published] = yield* query((db) =>
        db
          .update(events)
          .set({ status: "published", publishedAt: new Date(), publishAt: null, heldUntil: null, slug })
          .where(eq(events.id, eventId))
          .returning()
      );
      yield* queuePush(published, { now: true, required: true });
      yield* headsUp(published);
      yield* notifyFollowers(published);
      yield* inviteCohosts(published);
      yield* announce(published);
      yield* recordActivity({
        eventId,
        verb: "event.published",
        entityType: "event",
        entityId: eventId,
        summary: `publicó «${published.name}» para el ${shortWhen(published.startDate)}`,
      });
      const event = yield* editableOf(eventId);

      refreshEvent(event.communitySlug, slug);

      return { event, path: `/comunidad/${event.communitySlug}/events/${slug}` };
    })
  );

/** Events whose Owy announcement was queued by this instance, sent right after the response */
const toAnnounce = new Set<string>();

/**
 * The organizers asked Owy to post it on OWU's Slack and/or Telegram: queued as the event's messages.
 * The text is written here from the event, escaped for Slack, so it can't mention or link anything else.
 */
const announce = (event: EventRow) =>
  Effect.gen(function* () {
    const channels = event.announcement.channels ?? [];
    if (channels.length === 0) return;
    const [row] = yield* query((db) =>
      db
        .select({ community: communities.name, slug: communities.slug, venue: venues.name })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(eq(events.id, event.id))
    );
    if (!row) return;
    const text = announcementText({
      name: event.name,
      summary: event.summary,
      startDate: event.startDate.toISOString(),
      place: event.mode === "online" ? "Online" : (row.venue ?? event.placeName ?? "Lugar a confirmar"),
      community: row.community,
      url: appUrl(eventPagePath(row.slug, event.slug)),
    });
    const actor = yield* Effect.serviceOption(CurrentUser);
    yield* query((db) =>
      db.insert(outboundMessages).values(
        channels.map((channel) => ({
          eventId: event.id,
          channel,
          body: channel === "slack" ? slackSafe(text) : text,
          scheduledAt: new Date(),
          createdById: Option.isSome(actor) ? actor.value.id : null,
        }))
      )
    );
    toAnnounce.add(event.id);
  });

/** Post the announcements queued here now, not at the next tick (which still catches a miss). */
export async function announceSoon() {
  const ids = [...toAnnounce];
  toAnnounce.clear();
  for (const id of ids) {
    await Effect.runPromiseWith(liveServices)(Comms.dispatchDue(id)).catch((error: unknown) =>
      console.error("[events] announcement failed", error)
    );
  }
}

/**
 * Publish later, by itself: the same checks as publishing now, a time ahead of the event, and the
 * date stays reserved until then. `null` takes the schedule back.
 */
export const schedulePublish = (input: { eventId: string; publishAt: string | null }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const [row] = yield* query((db) =>
        db
          .select()
          .from(events)
          .where(and(eq(events.id, input.eventId), eq(events.communityId, communityId)))
          .for("update")
      );
      if (!row) return yield* notFound;
      if (row.status !== "draft") {
        return yield* new Conflict({ reason: "not_draft", message: "Ese evento ya está publicado" });
      }
      const me = yield* CurrentUser;
      const at = input.publishAt ? new Date(input.publishAt) : null;
      if (at) {
        const missing = issues(yield* editableOf(row.id)).filter((issue) => issue.level === "required");
        if (missing.length > 0) {
          return yield* new Invalid({
            message: `Antes de programarlo: ${missing.map((issue) => issue.text.toLowerCase()).join(", ")}`,
            issues: missing,
          });
        }
        if (at.getTime() < Date.now() + 5 * 60_000 || at.getTime() >= row.startDate.getTime()) {
          return yield* new Invalid({ message: "Elegí un momento de acá a que empiece el evento" });
        }
      }

      yield* query((db) =>
        db
          .update(events)
          .set({
            publishAt: at,
            publishById: at ? me.id : null,
            // The hold lasts until it publishes
            ...(at && row.heldUntil && row.heldUntil < at ? { heldUntil: at } : {}),
            updatedAt: new Date(),
          })
          .where(eq(events.id, row.id))
      );

      return yield* editableOf(row.id);
    })
  );

/**
 * The tick: publish the drafts whose time came, as whoever scheduled them, while they still
 * organize the community (or are site staff). One that can't be published any more loses its
 * schedule, and the reason goes in its activity.
 */
export const publishDue = Effect.gen(function* () {
  const due = yield* query((db) =>
    db
      .select({ id: events.id, communityId: events.communityId, by: user })
      .from(events)
      .leftJoin(user, eq(user.id, events.publishById))
      .where(and(eq(events.status, "draft"), lte(events.publishAt, new Date())))
  );
  let published = 0;
  for (const event of due) {
    const role = event.by ? yield* memberRole(event.communityId, event.by.id) : null;
    const allowed = event.by?.role === "admin" || (role !== null && ROLE_RANK[role] >= ROLE_RANK.editor);
    const actor = event.by
      ? { id: event.by.id, name: event.by.name, role: event.by.role, via: "session" as const }
      : null;
    const attempt =
      allowed && actor
        ? publish(event.id).pipe(Effect.provideService(CurrentUser, actor))
        : Effect.fail(new Error("quien lo programó ya no organiza la comunidad"));
    const outcome = yield* attempt.pipe(
      Effect.provideService(CommunityScope, { communityId: event.communityId }),
      Effect.as("published" as const),
      Effect.catch((error) =>
        query((db) => db.update(events).set({ publishAt: null }).where(eq(events.id, event.id))).pipe(
          Effect.andThen(
            recordActivity({
              eventId: event.id,
              verb: "event.schedule_failed",
              entityType: "event",
              entityId: event.id,
              summary: `no se pudo publicar solo: ${error instanceof Error ? error.message : String(error)}`,
            })
          ),
          Effect.as("failed" as const)
        )
      )
    );
    if (outcome === "published") published += 1;
  }

  return { due: due.length, published };
});

/** Cancel a published event: it stays listed as cancelled, and its calendar invites are withdrawn. */
export const cancel = (input: { eventId: string; reason: string }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const [row] = yield* query((db) =>
        db
          .update(events)
          .set({ status: "cancelled", icsSequence: sql`${events.icsSequence} + 1` })
          .where(and(eq(events.id, input.eventId), eq(events.communityId, communityId), eq(events.status, "published")))
          .returning()
      );
      if (!row) {
        return yield* new Conflict({ reason: "not_published", message: "Solo se cancela un evento publicado" });
      }
      yield* recordActivity({
        eventId: row.id,
        verb: "event.cancelled",
        entityType: "event",
        entityId: row.id,
        summary: input.reason ? `canceló el evento: ${input.reason}` : "canceló el evento",
      });
      yield* notifyCancelled(row.id);
      yield* queuePush(row, { now: true });
      const cancelled = yield* editableOf(row.id);
      refreshEvent(cancelled.communitySlug, cancelled.slug);

      return cancelled;
    })
  );

// ---------------------------------------------------------------------------
// The public page
// ---------------------------------------------------------------------------

const toPublic = (eventId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({ event: events, community: communities, venue: venues })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(eq(events.id, eventId))
    );
    if (!row) return yield* notFound;
    const { event, community, venue } = row;
    const [seats] = yield* query((db) =>
      db
        .select({
          taken:
            sql<number>`coalesce(sum(1 + ${attendees.guests}) filter (where ${attendees.status} in ('attending', 'offered')), 0)`.mapWith(
              Number
            ),
          waiting: sql<number>`count(*) filter (where ${attendees.status} = 'waitlisted')`.mapWith(Number),
        })
        .from(attendees)
        .where(and(eq(attendees.eventId, eventId), eq(attendees.source, "owu")))
    );
    const [board] = yield* query((db) =>
      db.select({ id: schedules.id }).from(schedules).where(eq(schedules.openSpaceId, eventId)).limit(1)
    );
    const place =
      event.mode === "online"
        ? null
        : venue
          ? {
              name: venue.name,
              area: [venue.neighbourhood, venue.city].filter(Boolean).join(", ") || null,
              address: venue.addressVisibility === "public" ? venue.address || null : null,
              mapUrl: venue.addressVisibility === "public" ? venue.mapUrl : null,
            }
          : event.placeName
            ? { name: event.placeName, area: null, address: event.placeAddress, mapUrl: event.venueMapUrl }
            : null;

    return {
      id: event.id,
      slug: event.slug,
      name: event.name,
      summary: event.summary,
      description: event.description,
      format: event.format,
      topics: event.topics.length > 0 ? event.topics : community.topics,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      status: event.status,
      mode: event.mode,
      place,
      registration: event.registration,
      registrationUrl: event.registrationUrl,
      capacity: event.capacity,
      waitlist: event.waitlist,
      approval: event.approval,
      guestsAllowed: event.guestsAllowed,
      rsvpClosesAt: event.rsvpClosesAt?.toISOString() ?? null,
      questions: event.questions,
      taken: seats?.taken ?? 0,
      waiting: seats?.waiting ?? 0,
      hasBoard: Boolean(board),
      community: { slug: community.slug, name: community.name, logoUrl: community.logoUrl },
      cohosts: yield* acceptedCohosts(event.id),
      meetupUrl: event.externalLinks.meetup ?? null,
      going: (yield* query((db) =>
        db
          .select({ name: attendees.name })
          .from(attendees)
          .where(
            and(
              eq(attendees.eventId, eventId),
              eq(attendees.source, "owu"),
              eq(attendees.status, "attending"),
              eq(attendees.showName, true)
            )
          )
          .orderBy(asc(attendees.registeredAt))
          .limit(12)
      )).map((row) => shortName(row.name)),
    } satisfies PublicEvent;
  });

/** A published (or cancelled) event by its address; drafts don't exist here. */
export const publicEvent = (communitySlug: string, eventSlug: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({ id: events.id })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(
          and(
            eq(communities.slug, communitySlug),
            eq(communities.isActive, true),
            eq(events.slug, eventSlug),
            eq(events.isActive, true),
            ne(events.status, "draft")
          )
        )
    );
    if (!row) return yield* notFound;

    return yield* toPublic(row.id);
  });

/** The organizers' preview of any of their events, drafts included. */
export const preview = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    if (!(yield* belongs(eventId, communityId))) return yield* notFound;

    return yield* toPublic(eventId);
  });

// ---------------------------------------------------------------------------
// The event dashboard
// ---------------------------------------------------------------------------

/** Counts for the dashboard: how many, never who (that's the attendee list, for admins). */
export const stats = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [event] = yield* query((db) =>
      db
        .select({ capacity: events.capacity })
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
    );
    if (!event) return yield* notFound;
    const [row] = yield* query((db) =>
      db
        .select({
          taken:
            sql<number>`coalesce(sum(1 + ${attendees.guests}) filter (where ${attendees.status} in ('attending', 'offered')), 0)`.mapWith(
              Number
            ),
          attending: sql<number>`count(*) filter (where ${attendees.status} = 'attending')`.mapWith(Number),
          waiting: sql<number>`count(*) filter (where ${attendees.status} in ('waitlisted', 'offered'))`.mapWith(
            Number
          ),
          pending: sql<number>`count(*) filter (where ${attendees.status} = 'pending')`.mapWith(Number),
          cancelled:
            sql<number>`count(*) filter (where ${attendees.status} in ('cancelled', 'refunded', 'declined'))`.mapWith(
              Number
            ),
          checkedIn: sql<number>`count(*) filter (where ${attendees.checkedInAt} is not null)`.mapWith(Number),
        })
        .from(attendees)
        .where(eq(attendees.eventId, eventId))
    );

    return {
      capacity: event.capacity,
      ...(row ?? { taken: 0, attending: 0, waiting: 0, pending: 0, cancelled: 0, checkedIn: 0 }),
    };
  });

const MESSAGE_STATUSES = {
  attending: ["attending"],
  waiting: ["waitlisted", "offered"],
  pending: ["pending"],
} as const;

/** Write to the event's people (by where they stand). Each gets it once, whoever clicks twice. */
export const message = (input: {
  eventId: string;
  to: ("attending" | "waiting" | "pending")[];
  subject: string;
  body: string;
}) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const event = yield* editableOf(input.eventId);
      if (!(yield* belongs(input.eventId, communityId))) return yield* notFound;
      const statuses = input.to.flatMap((key) => MESSAGE_STATUSES[key]);
      const people = yield* query((db) =>
        db
          .select({ id: attendees.id, email: attendees.email })
          .from(attendees)
          .where(and(eq(attendees.eventId, input.eventId), inArray(attendees.status, statuses)))
      );
      const [community] = yield* query((db) =>
        db.select({ name: communities.name }).from(communities).where(eq(communities.id, communityId))
      );
      const fingerprint = createHash("sha256").update(`${input.subject}\n${input.body}`).digest("hex").slice(0, 16);
      const content = eventMessageEmail({
        community: community?.name ?? "",
        event: event.name,
        subject: input.subject,
        body: input.body,
        pageUrl: appUrl(eventPagePath(event.communitySlug, event.slug)),
      });
      for (const person of people.filter((row) => row.email)) {
        yield* enqueueEmail({
          kind: "event_message",
          to: person.email,
          dedupeKey: `event_message:${input.eventId}:${fingerprint}:${person.id}`,
          ...content,
        });
      }
      yield* recordActivity({
        eventId: input.eventId,
        verb: "event.messaged",
        entityType: "event",
        entityId: input.eventId,
        summary: `escribió a ${people.length} ${people.length === 1 ? "persona" : "personas"}: «${input.subject}»`,
      });

      return { sent: people.length };
    })
  );

/** OWU's own published events still ahead, soonest first: GET /api/v1/events/upcoming. */
export const upcoming = query((db) =>
  db
    .select({ event: events, community: communities, venueName: venues.name })
    .from(events)
    .innerJoin(communities, eq(communities.id, events.communityId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(
      and(
        eq(events.status, "published"),
        eq(events.isActive, true),
        eq(communities.isActive, true),
        gt(events.endDate, new Date())
      )
    )
    .orderBy(asc(events.startDate))
    .limit(100)
).pipe(
  Effect.map((rows) =>
    rows.map(({ event, community, venueName }) => ({
      id: event.id,
      name: event.name,
      summary: event.summary,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      url: appUrl(eventPagePath(community.slug, event.slug)),
      community: { slug: community.slug, name: community.name },
      mode: event.mode,
      place: event.mode === "online" ? null : (venueName ?? event.placeName),
      meetupUrl: event.externalLinks.meetup ?? null,
    }))
  )
);

/**
 * How many of the people with a seat came, over the community's last 18 months of events with OWU
 * sign-up where the door was used (at least one check-in). Under 3 such events it isn't known yet.
 */
export const showUp = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const rows = yield* query((db) =>
    db
      .select({
        seated: sql<number>`count(*) filter (where ${attendees.status} = 'attending')`.mapWith(Number),
        came: sql<number>`count(*) filter (where ${attendees.checkedInAt} is not null)`.mapWith(Number),
      })
      .from(attendees)
      .innerJoin(events, eq(events.id, attendees.eventId))
      .where(
        and(
          eq(events.communityId, communityId),
          eq(events.status, "published"),
          eq(attendees.source, "owu"),
          lt(events.endDate, new Date()),
          gt(events.endDate, new Date(Date.now() - 548 * DAY_MS))
        )
      )
      .groupBy(attendees.eventId)
  );
  const counted = rows.filter((row) => row.came > 0 && row.seated > 0);
  const seated = counted.reduce((sum, row) => sum + row.seated, 0);
  const came = counted.reduce((sum, row) => sum + row.came, 0);

  return { rate: counted.length >= 3 ? Math.min(1, came / seated) : null, events: counted.length };
});
