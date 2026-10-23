import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import { clockTime, dayKey, montevideoIso, shortWhen } from "../../community/time";
import {
  attendees,
  communities,
  events,
  user,
  venueContacts,
  venueRequests,
  venues,
  type EventRow,
  type VenueRequestOption,
  type VenueRequestRow,
  type VenueRow,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, venueAnsweredHostEmail, venueRequestEmail, venueResponseEmail } from "../../email/templates";
import {
  venueBroadcastClosedEmail,
  venueBroadcastFailedEmail,
  venueProposalDeclinedEmail,
  venueProposedEmail,
} from "../../email/venue-templates";
import { readLink, signLink } from "../../links";
import { isActive, staleReason, isStale } from "../../organizar/venue-contacts";
import type { VenueFactsInput } from "../../organizar/venue-facts";
import { broadcastPicks, fullMonths, rankVenues, venueFit } from "../../organizar/venue-fit";
import { refreshEvent } from "../../revalidate";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import * as Events from "../events/service";
import { queuePush } from "../integrations/service";
import { recordActivity } from "../ops";
import { CommunityScope, CurrentUser } from "../services";
import type {
  BroadcastInput,
  BroadcastPreviewInput,
  ManagedVenue,
  RankedVenue,
  RequestVenueInput,
  RespondInput,
  SubmitVenueInput,
  Venue,
  VenueListInput,
  VenueRequest,
} from "./schemas";

/** A host has three days to answer. */
export const ANSWER_HOURS = 72;
/** The link keeps opening (to show what happened) a while after the request closes. */
const LINK_DAYS = 30;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
/** Requests still waiting for someone: the host (pending) or the organizer (a proposal). */
const OPEN = ["pending", "proposed"] as const;

type BaseVenue = Omit<Venue, "hostedThisYear" | "lastHostedAt" | "hosted" | "contactStale">;
type ContactRow = typeof venueContacts.$inferSelect;
type OptionInput = RequestVenueInput["options"][number];

const toVenue = (row: VenueRow, hostedUs = 0): BaseVenue => ({
  id: row.id,
  name: row.name,
  neighbourhood: row.neighbourhood,
  city: row.city,
  capacity: row.capacity,
  amenities: row.amenities,
  hostDays: row.hostDays,
  availability: row.availability,
  leadDays: row.leadDays,
  monthlyCap: row.monthlyCap,
  logoUrl: row.logoUrl,
  requestable: row.requestable,
  fallback: row.fallback,
  hostedUs,
  facts: row.facts,
});

const notFound = new NotFound({ entity: "venue", message: "Ese espacio no existe" });
const requestNotFound = new NotFound({ entity: "venue_request", message: "Ese pedido no existe" });

/**
 * The active spaces for an event, best first (see venue-fit): what doesn't work for its size, needs
 * or day goes last with the reason, and among the rest the best fit and who hosted least recently.
 * With each, how often it hosts (fair rotation) and whether its contacts still answer, never who they are.
 */
export const list = (input: VenueListInput) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db.select().from(venues).where(eq(venues.status, "active")).orderBy(asc(venues.name))
    );
    const yearAgo = new Date(Date.now() - 365 * DAY_MS);
    const yearStart = Date.parse(montevideoIso(`${dayKey(new Date()).slice(0, 4)}-01-01T00:00`));
    const [requests, hosted, contacts, ours] = yield* Effect.all([
      query((db) =>
        db
          .select({
            venueId: venueRequests.venueId,
            communityId: venueRequests.communityId,
            status: venueRequests.status,
            createdAt: venueRequests.createdAt,
          })
          .from(venueRequests)
      ),
      query((db) =>
        db
          .select({ venueId: events.venueId, startDate: events.startDate })
          .from(events)
          .where(and(isNotNull(events.venueId), eq(events.status, "published")))
      ),
      query((db) =>
        db
          .select({
            venueId: venueContacts.venueId,
            consentAt: venueContacts.consentAt,
            lastConfirmedAt: venueContacts.lastConfirmedAt,
            bouncedAt: venueContacts.bouncedAt,
            leftAt: venueContacts.leftAt,
          })
          .from(venueContacts)
      ),
      // This community's past events at each space, with who came (the door's count, else who had a seat)
      query((db) =>
        db
          .select({
            venueId: events.venueId,
            came: sql<number>`count(${attendees.id}) filter (where ${attendees.checkedInAt} is not null)`.mapWith(
              Number
            ),
            seated:
              sql<number>`coalesce(sum(1 + ${attendees.guests}) filter (where ${attendees.status} = 'attending'), 0)`.mapWith(
                Number
              ),
          })
          .from(events)
          .leftJoin(attendees, eq(attendees.eventId, events.id))
          .where(
            and(
              eq(events.communityId, input.communityId),
              eq(events.status, "published"),
              isNotNull(events.venueId),
              lt(events.endDate, new Date())
            )
          )
          .groupBy(events.id, events.venueId)
      ),
    ]);
    const busy = yield* Effect.forEach(rows, (row) => busyDays(row.id));
    const now = Date.now();

    const ranked = rankVenues(
      rows.map((row, at) => {
        const theirs = requests.filter((request) => request.venueId === row.id);
        const asked = theirs.filter((request) => request.createdAt > yearAgo && request.status !== "cancelled");
        const answered = asked.filter((request) => ["accepted", "declined", "proposed"].includes(request.status));
        const past = hosted.filter((event) => event.venueId === row.id && event.startDate.getTime() <= now);
        const lastHosted = past.reduce<Date | null>(
          (last, event) => (!last || event.startDate > last ? event.startDate : last),
          null
        );
        const mine = ours.filter((event) => event.venueId === row.id);
        const people = contacts.filter((contact) => contact.venueId === row.id);
        const usedTimes = theirs.filter(
          (request) => request.communityId === input.communityId && request.status === "accepted"
        ).length;
        const venue = toVenue(row, usedTimes);
        const fit = venueFit(
          {
            ...venue,
            lastHostedAt: lastHosted?.toISOString() ?? null,
            responseRate: asked.length > 0 ? answered.length / asked.length : null,
          },
          { size: input.size ?? null, needs: input.needs ?? [], day: input.day ?? null },
          { busy: busy[at] ?? [] },
          now
        );

        return {
          ...venue,
          hostedThisYear: past.filter((event) => event.startDate.getTime() >= yearStart).length,
          lastHostedAt: lastHosted?.toISOString() ?? null,
          hosted: {
            times: mine.length,
            people: mine.reduce((sum, event) => sum + (event.came > 0 ? event.came : event.seated), 0),
          },
          contactStale: row.requestable && people.length > 0 && people.every((contact) => isStale(contact, now)),
          fit,
        };
      })
    );

    return ranked.map(({ fit, ...venue }): RankedVenue => ({
      ...venue,
      fit: { blockers: fit.blockers, missing: fit.missing as RankedVenue["fit"]["missing"], score: fit.score },
    }));
  });

/** Days a space is taken: accepted requests and published events there. */
export const busyDays = (venueId: string) =>
  Effect.gen(function* () {
    const accepted = yield* query((db) =>
      db
        .select({ options: venueRequests.options, chosen: venueRequests.chosenOption })
        .from(venueRequests)
        .where(and(eq(venueRequests.venueId, venueId), eq(venueRequests.status, "accepted")))
    );
    const hosted = yield* query((db) =>
      db
        .select({ startDate: events.startDate })
        .from(events)
        .where(and(eq(events.venueId, venueId), eq(events.status, "published")))
    );

    return [
      ...accepted.flatMap((row) => (row.chosen === null ? [] : [dayKey(row.options[row.chosen]?.start ?? "")])),
      ...hosted.map((row) => dayKey(row.startDate)),
    ].filter(Boolean);
  });

const contactsOf = (venueId: string) =>
  query((db) =>
    db.select().from(venueContacts).where(eq(venueContacts.venueId, venueId)).orderBy(asc(venueContacts.createdAt))
  );

/** Who requests go to: still there, mail not bouncing. */
export const activeContactsOf = (venueId: string) =>
  contactsOf(venueId).pipe(Effect.map((rows) => rows.filter(isActive)));

/** The person an accepted request shows the organizer: who answered, else the space's first active contact. */
const shownContact = (row: VenueRequestRow, contacts: ContactRow[]) =>
  row.status === "accepted" && row.shareContact
    ? (contacts.find((contact) => contact.id === row.answeredById) ?? contacts.find(isActive) ?? null)
    : null;

/** The community's requests (or one of them), newest first, with the event each is for. */
const readRequests = (where: SQL | undefined, limit = 100) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select({ request: venueRequests, venue: venues, event: events })
        .from(venueRequests)
        .innerJoin(venues, eq(venues.id, venueRequests.venueId))
        .leftJoin(events, eq(events.id, venueRequests.eventId))
        .where(where)
        .orderBy(desc(venueRequests.createdAt))
        .limit(limit)
    );
    const shared = rows.filter((row) => row.request.status === "accepted" && row.request.shareContact);
    const contacts =
      shared.length > 0
        ? yield* query((db) =>
            db
              .select()
              .from(venueContacts)
              .where(
                inArray(
                  venueContacts.venueId,
                  shared.map((row) => row.venue.id)
                )
              )
              .orderBy(asc(venueContacts.createdAt))
          )
        : [];

    return rows.map((row) =>
      toRequest(
        row.request,
        row.venue,
        shownContact(
          row.request,
          contacts.filter((contact) => contact.venueId === row.venue.id)
        ),
        row.event
      )
    );
  });

const toRequest = (
  row: VenueRequestRow,
  venue: Pick<VenueRow, "id" | "name" | "neighbourhood" | "address">,
  contact: Pick<ContactRow, "id" | "name" | "email"> | null,
  event: Pick<EventRow, "name" | "endDate" | "hostRecapSentAt"> | null
): VenueRequest => {
  const accepted = row.status === "accepted";

  return {
    id: row.id,
    venue: { id: venue.id, name: venue.name, neighbourhood: venue.neighbourhood },
    eventId: row.eventId,
    options: row.options,
    expectedAttendees: row.expectedAttendees,
    message: row.message,
    status: effectiveStatus(row),
    chosenOption: row.chosenOption,
    counterOptions: row.counterOptions,
    broadcastId: row.broadcastId,
    hostMessage: row.hostMessage,
    address: accepted ? venue.address || null : null,
    contact: accepted && contact ? { id: contact.id, name: contact.name, email: contact.email } : null,
    event: event
      ? {
          name: event.name,
          endDate: event.endDate.toISOString(),
          recapSentAt: event.hostRecapSentAt?.toISOString() ?? null,
        }
      : null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
};

const optionLabel = (option: VenueRequestOption) => shortWhen(option.start);

const toOptions = (options: OptionInput[]) =>
  options.map((option): VenueRequestOption => {
    const start = new Date(montevideoIso(`${option.day}T${option.startTime}`));

    return {
      start: start.toISOString(),
      end: new Date(start.getTime() + option.durationMin * 60_000).toISOString(),
    };
  });

const anyPast = (options: VenueRequestOption[]) => options.some((option) => Date.parse(option.start) < Date.now());

/** Why a space can't take these dates, in words (its notice, its meetups a month, its weekdays); null if it can. */
const problemWith = (venue: VenueRow, options: OptionInput[]) =>
  Effect.gen(function* () {
    const notice = Date.now() + venue.leadDays * DAY_MS;
    if (options.some((option) => Date.parse(montevideoIso(`${option.day}T23:59`)) < notice)) {
      return `${venue.name} pide al menos ${venue.leadDays} días de anticipación`;
    }
    const full = fullMonths(yield* busyDays(venue.id), venue.monthlyCap);
    if (options.some((option) => full.includes(option.day.slice(0, 7)))) {
      return `${venue.name} ya recibe ${venue.monthlyCap} ${venue.monthlyCap === 1 ? "meetup" : "meetups"} ese mes: probá otro mes`;
    }
    if (
      venue.hostDays.length > 0 &&
      options.some((option) => !venue.hostDays.includes(new Date(`${option.day}T12:00:00Z`).getUTCDay()))
    ) {
      const days = venue.hostDays.toSorted((a, b) => a - b).map((day) => WEEKDAYS[day]);
      return `${venue.name} recibe solo los ${days.join(", ")}`;
    }

    return null;
  });

/** Each contact gets the request with their own link, so the answer says who gave it. */
const requestToken = (requestId: string, contactId: string, expiresAt: Date) =>
  Effect.promise(() =>
    signLink("venue-request", `${requestId}.${contactId}`, new Date(expiresAt.getTime() + LINK_DAYS * DAY_MS))
  );

/** Email a request to these contacts; a contact who already got it doesn't get it twice. */
const deliver = (row: VenueRequestRow, venueName: string, contacts: ContactRow[]) =>
  Effect.gen(function* () {
    const [community] = yield* query((db) =>
      db.select({ name: communities.name }).from(communities).where(eq(communities.id, row.communityId))
    );
    const [organizer] = row.requestedById
      ? yield* query((db) =>
          db
            .select({ name: user.name })
            .from(user)
            .where(eq(user.id, row.requestedById ?? ""))
        )
      : [];
    for (const contact of contacts) {
      const token = yield* requestToken(row.id, contact.id, row.expiresAt);
      yield* enqueueEmail({
        kind: "venue_request",
        to: contact.email,
        priority: 2,
        dedupeKey: `venue_request:${row.id}:${contact.email}`,
        ...venueRequestEmail({
          venue: venueName,
          community: community?.name ?? "Una comunidad",
          organizer: organizer?.name.split(" ")[0] ?? "",
          options: row.options.map(optionLabel),
          expectedAttendees: row.expectedAttendees,
          message: row.message,
          until: shortWhen(row.expiresAt),
          link: appUrl(`/espacios/pedido/${token}`),
          broadcast: row.broadcastId !== null,
        }),
      });
    }
  });

const openRequestTo = (venueId: string, communityId: string) =>
  query((db) =>
    db
      .select({ id: venueRequests.id })
      .from(venueRequests)
      .where(
        and(
          eq(venueRequests.venueId, venueId),
          eq(venueRequests.communityId, communityId),
          inArray(venueRequests.status, [...OPEN])
        )
      )
  ).pipe(Effect.map((rows) => rows.length > 0));

/**
 * Ask a space to host: 1–3 ranked dates, sent to its consented contacts with a link they answer
 * without an account. One open request per community and space at a time.
 */
export const request = (input: RequestVenueInput) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const me = yield* CurrentUser;
      const [venue] = yield* query((db) => db.select().from(venues).where(eq(venues.id, input.venueId)));
      if (!venue || venue.status !== "active") return yield* notFound;
      if (!venue.requestable) {
        return yield* new Conflict({
          reason: "not_requestable",
          message: "A este espacio lo coordina el staff de OWU: escribí en #organizadores-meetups",
        });
      }

      const options = toOptions(input.options);
      if (anyPast(options)) return yield* new Invalid({ message: "Una de las fechas ya pasó" });
      const problem = yield* problemWith(venue, input.options);
      if (problem) return yield* new Invalid({ message: problem });

      if (yield* openRequestTo(venue.id, communityId)) {
        return yield* new Conflict({
          reason: "already_pending",
          message: `Ya le pediste a ${venue.name}: esperá su respuesta o cancelá ese pedido`,
        });
      }
      const contacts = yield* activeContactsOf(venue.id);
      if (contacts.length === 0) {
        return yield* new Conflict({ reason: "not_requestable", message: "Este espacio no tiene contacto todavía" });
      }

      const [row] = yield* query((db) =>
        db
          .insert(venueRequests)
          .values({
            venueId: venue.id,
            communityId,
            eventId: input.eventId ?? null,
            requestedById: me.id,
            options,
            expectedAttendees: input.expectedAttendees,
            message: input.message,
            expiresAt: new Date(Date.now() + ANSWER_HOURS * HOUR_MS),
          })
          .returning()
      );
      yield* deliver(row, venue.name, contacts);
      yield* recordActivity({
        eventId: input.eventId ?? null,
        verb: "venue.requested",
        entityType: "venue_request",
        entityId: row.id,
        summary: `le pidió espacio a ${venue.name} para ${options.length === 1 ? "una fecha" : `${options.length} fechas`}`,
      });

      return toRequest(row, venue, null, null);
    })
  );

/**
 * Who a "Buscamos espacio" goes to: of the spaces that fit the event (ranked for its first date),
 * those that can take every date asked, have someone to answer and haven't an open request from
 * this community; the best few (see broadcastPicks).
 */
const broadcastTargets = (communityId: string, input: BroadcastPreviewInput) =>
  Effect.gen(function* () {
    const ranked = yield* list({
      communityId,
      size: input.size,
      needs: input.needs,
      day: input.options[0]?.day ?? null,
    });
    const rows = yield* query((db) => db.select().from(venues).where(eq(venues.status, "active")));
    const eligible: RankedVenue[] = [];
    for (const venue of ranked) {
      const row = rows.find((candidate) => candidate.id === venue.id);
      if (!row || !venue.requestable || venue.fallback || venue.fit.blockers.length > 0) continue;
      if (yield* openRequestTo(venue.id, communityId)) continue;
      if ((yield* activeContactsOf(venue.id)).length === 0) continue;
      if (yield* problemWith(row, input.options)) continue;
      eligible.push(venue);
    }

    return broadcastPicks(eligible).map((venue) => ({ id: venue.id, name: venue.name }));
  });

/** The spaces a "Buscamos espacio" with these dates would reach, to show before sending. */
export const broadcastPreview = (input: BroadcastPreviewInput) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    if (anyPast(toOptions(input.options))) return [];

    return yield* broadcastTargets(communityId, input);
  });

/** One request to several spaces at once, sharing a broadcast id: the first to accept takes it. */
export const broadcast = (input: BroadcastInput) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const me = yield* CurrentUser;
      const options = toOptions(input.options);
      if (anyPast(options)) return yield* new Invalid({ message: "Una de las fechas ya pasó" });
      const targets = yield* broadcastTargets(communityId, input);
      if (targets.length === 0) {
        return yield* new Conflict({
          reason: "no_venues",
          message: "Ningún espacio puede en esas fechas: probá otras, o pedile a uno de la lista",
        });
      }

      const broadcastId = createId();
      const expiresAt = new Date(Date.now() + ANSWER_HOURS * HOUR_MS);
      for (const target of targets) {
        const [row] = yield* query((db) =>
          db
            .insert(venueRequests)
            .values({
              venueId: target.id,
              communityId,
              eventId: input.eventId ?? null,
              requestedById: me.id,
              options,
              expectedAttendees: input.expectedAttendees,
              message: input.message,
              expiresAt,
              broadcastId,
            })
            .returning()
        );
        yield* deliver(row, target.name, yield* activeContactsOf(target.id));
      }
      yield* recordActivity({
        eventId: input.eventId ?? null,
        verb: "venue.broadcast",
        entityType: "venue_request",
        entityId: broadcastId,
        summary: `buscó espacio en ${targets.length} lugares a la vez: ${targets.map((target) => target.name).join(", ")}`,
      });

      return { broadcastId, venues: targets };
    })
  );

/** The community's requests, newest first. */
export const requests = (communityId: string) => readRequests(eq(venueRequests.communityId, communityId));

const requestView = (requestId: string) =>
  readRequests(eq(venueRequests.id, requestId), 1).pipe(Effect.map(([view]) => view));

/**
 * A request and, when it went to several spaces, all of them, locked in one order: two hosts
 * accepting at once queue up instead of deadlocking, and the second sees the first's answer.
 */
const lockRequest = (requestId: string, communityId?: string) =>
  Effect.gen(function* () {
    const [peek] = yield* query((db) =>
      db
        .select({ broadcastId: venueRequests.broadcastId, communityId: venueRequests.communityId })
        .from(venueRequests)
        .where(eq(venueRequests.id, requestId))
    );
    if (!peek || (communityId && peek.communityId !== communityId)) return yield* requestNotFound;
    const rows = yield* query((db) =>
      db
        .select()
        .from(venueRequests)
        .where(peek.broadcastId ? eq(venueRequests.broadcastId, peek.broadcastId) : eq(venueRequests.id, requestId))
        .orderBy(asc(venueRequests.id))
        .for("update")
    );
    const row = rows.find((candidate) => candidate.id === requestId);
    if (!row) return yield* requestNotFound;

    return { row, siblings: rows.filter((candidate) => candidate.id !== requestId) };
  });

const taken = (row: VenueRequestRow, siblings: Pick<VenueRequestRow, "status">[]) =>
  row.status === "cancelled" && row.broadcastId !== null && siblings.some((sibling) => sibling.status === "accepted");

/** Withdraw a request still waiting for an answer (undone with `reopen`). */
export const cancel = (requestId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const [row] = yield* query((db) =>
        db
          .update(venueRequests)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(venueRequests.id, requestId),
              eq(venueRequests.communityId, communityId),
              eq(venueRequests.status, "pending")
            )
          )
          .returning({ id: venueRequests.id })
      );
      if (!row)
        return yield* new Conflict({ reason: "not_pending", message: "Ese pedido ya no está esperando respuesta" });

      return { id: row.id };
    })
  );

/** Undo a cancel: the request waits again, if it's still in time and nobody took it meanwhile. */
export const reopen = (requestId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const { row, siblings } = yield* lockRequest(requestId, communityId);
      if (row.status !== "cancelled" || row.respondedAt || taken(row, siblings)) {
        return yield* new Conflict({ reason: "not_cancelled", message: "Ese pedido ya no se puede reabrir" });
      }
      if (row.expiresAt.getTime() < Date.now()) {
        return yield* new Conflict({ reason: "expired", message: "El pedido ya venció: mandá uno nuevo" });
      }
      if (yield* openRequestTo(row.venueId, communityId)) {
        return yield* new Conflict({ reason: "already_pending", message: "Ya hay otro pedido abierto a ese espacio" });
      }
      yield* query((db) => db.update(venueRequests).set({ status: "pending" }).where(eq(venueRequests.id, row.id)));

      return yield* requestView(row.id);
    })
  );

/** A host's link: the request, and the contact it was for (older links name only the request). */
const fromToken = (token: string) =>
  Effect.promise(() => readLink("venue-request", token)).pipe(
    Effect.flatMap((value) => {
      if (!value) return Effect.fail(requestNotFound);
      const [requestId = "", contactId = null] = value.split(".");

      return Effect.succeed({ requestId, contactId });
    })
  );

/** A pending request past its deadline reads as expired, even before the sweep marks it. */
const effectiveStatus = (row: VenueRequestRow) =>
  row.status === "pending" && row.expiresAt.getTime() < Date.now() ? ("expired" as const) : row.status;

/** What the host's link shows. Reading it never changes anything. */
export const byToken = (token: string) =>
  Effect.gen(function* () {
    const { requestId } = yield* fromToken(token);
    const [row] = yield* query((db) =>
      db
        .select({
          request: venueRequests,
          venueName: venues.name,
          addressVisibility: venues.addressVisibility,
          communityName: communities.name,
          organizerName: user.name,
          eventName: events.name,
        })
        .from(venueRequests)
        .innerJoin(venues, eq(venues.id, venueRequests.venueId))
        .innerJoin(communities, eq(communities.id, venueRequests.communityId))
        .leftJoin(user, eq(user.id, venueRequests.requestedById))
        .leftJoin(events, eq(events.id, venueRequests.eventId))
        .where(eq(venueRequests.id, requestId))
    );
    if (!row) return yield* requestNotFound;
    const siblings = row.request.broadcastId
      ? yield* query((db) =>
          db
            .select({ status: venueRequests.status })
            .from(venueRequests)
            .where(eq(venueRequests.broadcastId, row.request.broadcastId ?? ""))
        )
      : [];

    return {
      venueName: row.venueName,
      communityName: row.communityName,
      organizerName: row.organizerName?.split(" ")[0] ?? "",
      eventName: row.eventName,
      options: row.request.options,
      expectedAttendees: row.request.expectedAttendees,
      message: row.request.message,
      status: effectiveStatus(row.request),
      chosenOption: row.request.chosenOption,
      counterOptions: row.request.counterOptions,
      taken: taken(row.request, siblings),
      expiresAt: row.request.expiresAt.toISOString(),
      addressVisibility: row.addressVisibility,
    };
  });

/**
 * A date taken for the request's event. A draft is dated and held through the calendar's own hold
 * (HOLD_DAYS, the cap, the heads-up to similar communities); with the cap reached it's dated
 * without the hold. A published event keeps its date, gets the space, and its people hear about
 * the new place after the usual 10 minutes (the invite's sequence goes up).
 */
const placeEvent = (row: VenueRequestRow, chosen: VenueRequestOption) =>
  Effect.gen(function* () {
    if (!row.eventId) return null;
    const [event] = yield* query((db) =>
      db
        .select({ event: events, slug: communities.slug })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(eq(events.id, row.eventId ?? ""))
    );
    if (!event || event.event.status === "cancelled") return null;
    const { id, status, venueId, icsSequence } = event.event;

    if (status === "draft") {
      const start = new Date(chosen.start);
      const held = yield* Events.hold({
        communityId: row.communityId,
        eventId: id,
        day: dayKey(start),
        startTime: clockTime(start),
        durationMin: Math.round((Date.parse(chosen.end) - start.getTime()) / 60_000),
      }).pipe(
        Effect.provideService(CommunityScope, { communityId: row.communityId }),
        Effect.as("held" as const),
        Effect.catchTag("Conflict", (error) =>
          error.reason === "too_many_holds" ? Effect.succeed("unheld" as const) : Effect.fail(error)
        )
      );
      yield* query((db) =>
        db
          .update(events)
          .set({
            venueId: row.venueId,
            ...(held === "unheld" ? { startDate: new Date(chosen.start), endDate: new Date(chosen.end) } : {}),
          })
          .where(eq(events.id, id))
      );

      return held;
    }
    if (venueId === row.venueId) return "same";
    const [updated] = yield* query((db) =>
      db
        .update(events)
        .set({ venueId: row.venueId, icsSequence: icsSequence + 1 })
        .where(eq(events.id, id))
        .returning()
    );
    yield* queuePush(updated);
    refreshEvent(event.slug, updated.slug);

    return "moved";
  });

/** The other spaces of a request one of them took: closed, and their contacts thanked. */
const closeSiblings = (siblings: VenueRequestRow[], community: string) =>
  Effect.gen(function* () {
    const open = siblings.filter((sibling) => (OPEN as readonly string[]).includes(sibling.status));
    if (open.length === 0) return;
    yield* query((db) =>
      db
        .update(venueRequests)
        .set({ status: "cancelled" })
        .where(
          inArray(
            venueRequests.id,
            open.map((sibling) => sibling.id)
          )
        )
    );
    for (const sibling of open) {
      const [venue] = yield* query((db) =>
        db.select({ name: venues.name }).from(venues).where(eq(venues.id, sibling.venueId))
      );
      for (const contact of yield* activeContactsOf(sibling.venueId)) {
        yield* enqueueEmail({
          kind: "venue_broadcast_closed",
          to: contact.email,
          dedupeKey: `venue_broadcast_closed:${sibling.id}:${contact.email}`,
          ...venueBroadcastClosedEmail({ venue: venue?.name ?? "tu espacio", community }),
        });
      }
    }
  });

/** A request to several spaces where none can: its organizer hears once, not once per space. */
const broadcastSettled = (broadcastId: string) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select({
          status: venueRequests.status,
          expiresAt: venueRequests.expiresAt,
          requestedById: venueRequests.requestedById,
          communityId: venueRequests.communityId,
        })
        .from(venueRequests)
        .where(eq(venueRequests.broadcastId, broadcastId))
    );
    const live = rows.some(
      (row) =>
        row.status === "accepted" ||
        row.status === "proposed" ||
        (row.status === "pending" && row.expiresAt.getTime() > Date.now())
    );
    const requester = rows[0]?.requestedById;
    if (live || !requester) return;
    const [details] = yield* query((db) =>
      db
        .select({ email: user.email, slug: communities.slug })
        .from(user)
        .innerJoin(communities, eq(communities.id, rows[0]?.communityId ?? ""))
        .where(eq(user.id, requester))
    );
    if (!details) return;
    yield* enqueueEmail({
      kind: "venue_response",
      to: details.email,
      dedupeKey: `venue_response:${broadcastId}`,
      ...venueBroadcastFailedEmail({ count: rows.length, panelPath: `/organizar/panel/${details.slug}/espacios` }),
    });
  });

/** Answered by now? Each closed state says why, so the host page can say it in words. */
const stillOpen = (row: VenueRequestRow, siblings: VenueRequestRow[]) =>
  Effect.gen(function* () {
    const status = effectiveStatus(row);
    if (status === "expired") {
      return yield* new Conflict({ reason: "expired", message: "El pedido venció: la comunidad ya buscó otro lugar" });
    }
    if (taken(row, siblings)) {
      return yield* new Conflict({ reason: "taken", message: "Ya se resolvió, ¡gracias!" });
    }
    if (status === "cancelled") {
      return yield* new Conflict({ reason: "cancelled", message: "La comunidad canceló el pedido" });
    }
    if (status !== "pending") {
      return yield* new Conflict({ reason: "already_answered", message: "Este pedido ya tiene respuesta" });
    }
  });

/**
 * The host's answer, from the link: take one of the dates, propose others, or not this time. Taking
 * one dates and places the event when there is one, closes the rest of a request sent to several
 * spaces, and only then do the two sides get each other's email. The contact who answered counts
 * as confirmed (they still answer for the space).
 */
export const respond = (input: RespondInput) =>
  Effect.gen(function* () {
    const { requestId, contactId } = yield* fromToken(input.token);

    return yield* transaction(
      Effect.gen(function* () {
        const { row, siblings } = yield* lockRequest(requestId);
        yield* stillOpen(row, siblings);
        const chosen = input.decision === "accept" ? row.options[input.option] : undefined;
        if (input.decision === "accept" && !chosen)
          return yield* new Invalid({ message: "Esa fecha no está en el pedido" });
        const counter = input.decision === "propose" ? toOptions(input.options) : [];
        if (anyPast(counter)) return yield* new Invalid({ message: "Una de las fechas que proponés ya pasó" });

        const contacts = yield* contactsOf(row.venueId);
        const answeredBy = contacts.find((contact) => contact.id === contactId) ?? null;
        const status =
          input.decision === "accept" ? "accepted" : input.decision === "propose" ? "proposed" : "declined";
        const [updated] = yield* query((db) =>
          db
            .update(venueRequests)
            .set({
              status,
              chosenOption: input.decision === "accept" ? input.option : null,
              counterOptions: counter,
              hostMessage: input.hostMessage || null,
              shareContact: input.decision === "decline" ? false : input.shareContact,
              answeredById: answeredBy?.id ?? null,
              respondedAt: new Date(),
            })
            .where(eq(venueRequests.id, row.id))
            .returning()
        );
        if (answeredBy) {
          yield* query((db) =>
            db
              .update(venueContacts)
              .set({ lastConfirmedAt: new Date(), bouncedAt: null })
              .where(eq(venueContacts.id, answeredBy.id))
          );
        }
        if (input.decision === "accept" && input.addressVisibility) {
          const visibility = input.addressVisibility;
          yield* query((db) =>
            db.update(venues).set({ addressVisibility: visibility }).where(eq(venues.id, row.venueId))
          );
        }
        const [venue] = yield* query((db) => db.select().from(venues).where(eq(venues.id, row.venueId)));
        const [community] = yield* query((db) =>
          db
            .select({ name: communities.name, slug: communities.slug })
            .from(communities)
            .where(eq(communities.id, row.communityId))
        );
        const [organizer] = row.requestedById
          ? yield* query((db) =>
              db
                .select({ name: user.name, email: user.email })
                .from(user)
                .where(eq(user.id, row.requestedById ?? ""))
            )
          : [];
        const active = contacts.filter(isActive);
        const panelPath = `/organizar/panel/${community?.slug ?? ""}/espacios`;

        let held: string | null = null;
        if (chosen) {
          held = yield* placeEvent(row, chosen);
          yield* closeSiblings(siblings, community?.name ?? "La comunidad");
        }

        if (organizer && venue && community) {
          if (input.decision === "propose") {
            yield* enqueueEmail({
              kind: "venue_response",
              to: organizer.email,
              priority: 2,
              dedupeKey: `venue_response:${row.id}`,
              ...venueProposedEmail({
                venue: venue.name,
                dates: counter.map(optionLabel),
                hostMessage: input.hostMessage || null,
                panelPath,
              }),
            });
          } else if (input.decision === "decline" && row.broadcastId) {
            yield* broadcastSettled(row.broadcastId);
          } else {
            const shown = chosen ? shownContact(updated, active) : null;
            yield* enqueueEmail({
              kind: "venue_response",
              to: organizer.email,
              priority: 2,
              dedupeKey: `venue_response:${row.id}`,
              ...venueResponseEmail({
                venue: venue.name,
                outcome: chosen ? "accepted" : "declined",
                when: chosen ? shortWhen(chosen.start) : null,
                address: chosen ? venue.address || null : null,
                hostMessage: input.hostMessage || null,
                contact: shown ? { name: shown.name, email: shown.email } : null,
                panelPath,
              }),
            });
          }
          if (chosen) {
            for (const contact of active) {
              yield* enqueueEmail({
                kind: "venue_answered_host",
                to: contact.email,
                dedupeKey: `venue_answered_host:${row.id}:${contact.email}`,
                ...venueAnsweredHostEmail({
                  venue: venue.name,
                  community: community.name,
                  when: shortWhen(chosen.start),
                  organizer: { name: organizer.name, email: organizer.email },
                }),
              });
            }
          }
        }
        yield* recordActivity({
          eventId: row.eventId,
          verb: chosen ? "venue.accepted" : input.decision === "propose" ? "venue.proposed" : "venue.declined",
          entityType: "venue_request",
          entityId: row.id,
          summary: chosen
            ? `${venue?.name ?? "El espacio"} aceptó recibir el ${shortWhen(chosen.start)}${held === "unheld" ? " (la fecha no quedó reservada: ya hay 8 reservas)" : ""}`
            : input.decision === "propose"
              ? `${venue?.name ?? "El espacio"} propuso otra fecha: ${counter.map(optionLabel).join(", ")}`
              : `${venue?.name ?? "El espacio"} no puede recibir esta vez`,
        });

        return { status: updated.status };
      })
    );
  });

/** The organizer takes one of the dates the host proposed: it's held for the event like any accept. */
export const acceptProposal = (input: { requestId: string; option: number }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const me = yield* CurrentUser;
      const { row, siblings } = yield* lockRequest(input.requestId, communityId);
      if (row.status !== "proposed") {
        return yield* new Conflict({ reason: "not_proposed", message: "Ese pedido ya no tiene una propuesta abierta" });
      }
      const chosen = row.counterOptions[input.option];
      if (!chosen) return yield* new Invalid({ message: "Esa fecha no está en la propuesta" });
      if (Date.parse(chosen.start) < Date.now()) {
        return yield* new Invalid({ message: "Esa fecha ya pasó: pedile otra al espacio" });
      }

      yield* query((db) =>
        db
          .update(venueRequests)
          .set({
            status: "accepted",
            // The proposal joins the request's dates, so what was taken reads the same as any accept
            options: [...row.options, ...row.counterOptions],
            chosenOption: row.options.length + input.option,
          })
          .where(eq(venueRequests.id, row.id))
      );
      const [venue] = yield* query((db) => db.select().from(venues).where(eq(venues.id, row.venueId)));
      const [community] = yield* query((db) =>
        db.select({ name: communities.name }).from(communities).where(eq(communities.id, communityId))
      );
      const [account] = yield* query((db) =>
        db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, me.id))
      );
      yield* placeEvent(row, chosen);
      yield* closeSiblings(siblings, community?.name ?? "La comunidad");
      for (const contact of yield* activeContactsOf(row.venueId)) {
        yield* enqueueEmail({
          kind: "venue_answered_host",
          to: contact.email,
          dedupeKey: `venue_answered_host:${row.id}:${contact.email}`,
          ...venueAnsweredHostEmail({
            venue: venue?.name ?? "tu espacio",
            community: community?.name ?? "La comunidad",
            when: shortWhen(chosen.start),
            organizer: { name: account?.name ?? me.name, email: account?.email ?? "" },
          }),
        });
      }
      yield* recordActivity({
        eventId: row.eventId,
        verb: "venue.accepted",
        entityType: "venue_request",
        entityId: row.id,
        summary: `aceptó la fecha que propuso ${venue?.name ?? "el espacio"}: ${shortWhen(chosen.start)}`,
      });

      return yield* requestView(row.id);
    })
  );

/** None of the host's dates work: the request closes and the host gets a polite thanks. */
export const declineProposal = (requestId: string) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const { row } = yield* lockRequest(requestId, communityId);
      if (row.status !== "proposed") {
        return yield* new Conflict({ reason: "not_proposed", message: "Ese pedido ya no tiene una propuesta abierta" });
      }
      yield* query((db) => db.update(venueRequests).set({ status: "cancelled" }).where(eq(venueRequests.id, row.id)));
      const [venue] = yield* query((db) =>
        db.select({ name: venues.name }).from(venues).where(eq(venues.id, row.venueId))
      );
      const [community] = yield* query((db) =>
        db.select({ name: communities.name }).from(communities).where(eq(communities.id, communityId))
      );
      for (const contact of yield* activeContactsOf(row.venueId)) {
        yield* enqueueEmail({
          kind: "venue_proposal_declined",
          to: contact.email,
          dedupeKey: `venue_proposal_declined:${row.id}:${contact.email}`,
          ...venueProposalDeclinedEmail({ venue: venue?.name ?? "tu espacio", community: community?.name ?? "" }),
        });
      }
      yield* recordActivity({
        eventId: row.eventId,
        verb: "venue.proposal_declined",
        entityType: "venue_request",
        entityId: row.id,
        summary: `le avisó a ${venue?.name ?? "el espacio"} que las otras fechas no le sirven`,
      });

      return { id: row.id };
    })
  );

/**
 * "Esta persona ya no está": the contact is marked as gone, staff see the space in their list to
 * re-verify, and a request still waiting goes to the space's other contacts. With nobody left,
 * the space stops taking requests (staff coordinate it) and the request closes.
 */
export const contactLeft = (input: { requestId: string; contactId?: string }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const { row } = yield* lockRequest(input.requestId, communityId);
      const contacts = yield* contactsOf(row.venueId);
      // ponytail: on a request still waiting, "esta persona" is who answered before or the space's
      // most recently confirmed contact; per-contact picking would need organizers to see who it went to
      const target = input.contactId
        ? shownContact(row, contacts)?.id === input.contactId
          ? contacts.find((contact) => contact.id === input.contactId)
          : undefined
        : (contacts.find((contact) => contact.id === row.answeredById && isActive(contact)) ??
          contacts
            .filter(isActive)
            .toSorted(
              (a, b) => (b.lastConfirmedAt ?? b.consentAt).getTime() - (a.lastConfirmedAt ?? a.consentAt).getTime()
            )[0]);
      if (!target)
        return yield* new NotFound({ entity: "venue_contact", message: "Esa persona no está en este pedido" });
      if (target.leftAt) return { remaining: contacts.filter(isActive).length };

      yield* query((db) => db.update(venueContacts).set({ leftAt: new Date() }).where(eq(venueContacts.id, target.id)));
      const remaining = contacts.filter((contact) => contact.id !== target.id && isActive(contact));
      const [venue] = yield* query((db) => db.select().from(venues).where(eq(venues.id, row.venueId)));
      if (remaining.length === 0) {
        yield* query((db) => db.update(venues).set({ requestable: false }).where(eq(venues.id, row.venueId)));
        if (row.status === "pending") {
          yield* query((db) =>
            db.update(venueRequests).set({ status: "cancelled" }).where(eq(venueRequests.id, row.id))
          );
        }
      } else if (effectiveStatus(row) === "pending") {
        yield* deliver(row, venue?.name ?? "", remaining);
      }
      yield* recordActivity({
        eventId: row.eventId,
        verb: "venue.contact_left",
        entityType: "venue",
        entityId: row.venueId,
        summary: `avisó que el contacto de ${venue?.name ?? "un espacio"} ya no está`,
      });

      return { remaining: remaining.length };
    })
  );

/** Requests nobody answered in time: closed, and their organizer told to look elsewhere. */
export const expireRequests = Effect.gen(function* () {
  const expired = yield* query((db) =>
    db
      .update(venueRequests)
      .set({ status: "expired" })
      .where(and(eq(venueRequests.status, "pending"), lt(venueRequests.expiresAt, new Date())))
      .returning()
  );
  for (const broadcastId of new Set(expired.flatMap((row) => (row.broadcastId ? [row.broadcastId] : [])))) {
    yield* broadcastSettled(broadcastId);
  }
  for (const row of expired) {
    if (!row.requestedById || row.broadcastId) continue;
    const [details] = yield* query((db) =>
      db
        .select({ email: user.email, venue: venues.name, slug: communities.slug })
        .from(user)
        .innerJoin(venues, eq(venues.id, row.venueId))
        .innerJoin(communities, eq(communities.id, row.communityId))
        .where(eq(user.id, row.requestedById ?? ""))
    );
    if (!details) continue;
    yield* enqueueEmail({
      kind: "venue_response",
      to: details.email,
      dedupeKey: `venue_response:${row.id}`,
      ...venueResponseEmail({
        venue: details.venue,
        outcome: "expired",
        when: null,
        address: null,
        hostMessage: null,
        contact: null,
        panelPath: `/organizar/panel/${details.slug}/espacios`,
      }),
    });
  }

  return { expired: expired.length };
});

/** Sumá tu espacio: the signed-in person offers a space and becomes its contact; staff review it. */
export const submit = (input: SubmitVenueInput) =>
  transaction(
    Effect.gen(function* () {
      const me = yield* CurrentUser;
      const [account] = yield* query((db) => db.select({ email: user.email }).from(user).where(eq(user.id, me.id)));
      const [row] = yield* query((db) =>
        db
          .insert(venues)
          .values({
            name: input.name,
            neighbourhood: input.neighbourhood,
            city: input.city,
            address: input.address,
            capacity: input.capacity,
            amenities: input.amenities,
            hostDays: input.hostDays,
            availability: input.availability,
            monthlyCap: input.monthlyCap,
            addressVisibility: input.addressVisibility,
            notes: input.notes,
            facts: input.facts,
            submittedById: me.id,
          })
          .returning()
      );
      const now = new Date();
      yield* query((db) =>
        db.insert(venueContacts).values({
          venueId: row.id,
          userId: me.id,
          name: me.name,
          email: account?.email ?? "",
          role: input.role,
          consentAt: now,
          lastConfirmedAt: now,
          consentNote: "Sumá tu espacio (owu.uy/empresas/espacio): acepta recibir pedidos de organizadores de OWU",
        })
      );

      return { id: row.id };
    })
  );

// ---------------------------------------------------------------------------
// Site staff: the only reads of contacts and addresses
// ---------------------------------------------------------------------------

export const manageList = Effect.gen(function* () {
  const rows = yield* query((db) => db.select().from(venues).orderBy(asc(venues.status), asc(venues.name)));
  const contacts = yield* query((db) => db.select().from(venueContacts).orderBy(asc(venueContacts.createdAt)));
  const now = Date.now();

  return rows.map((row): ManagedVenue => ({
    ...toVenue(row),
    address: row.address,
    mapUrl: row.mapUrl,
    addressVisibility: row.addressVisibility,
    notes: row.notes,
    status: row.status,
    contacts: contacts
      .filter((contact) => contact.venueId === row.id)
      .map((contact) => ({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        role: contact.role,
        consentAt: contact.consentAt.toISOString(),
        lastConfirmedAt: contact.lastConfirmedAt?.toISOString() ?? null,
        bouncedAt: contact.bouncedAt?.toISOString() ?? null,
        leftAt: contact.leftAt?.toISOString() ?? null,
        stale: staleReason(contact, now),
      })),
    createdAt: row.createdAt.toISOString(),
  }));
});

export const manageUpdate = (
  venueId: string,
  data: Partial<
    Pick<
      VenueRow,
      "status" | "requestable" | "fallback" | "name" | "neighbourhood" | "address" | "capacity" | "notes" | "logoUrl"
    >
  > & { facts?: VenueFactsInput }
) =>
  Effect.gen(function* () {
    if (data.requestable) {
      const contacts = yield* activeContactsOf(venueId);
      if (contacts.length === 0) {
        return yield* new Conflict({
          reason: "no_contact",
          message: "Para recibir pedidos el espacio necesita un contacto activo que haya aceptado",
        });
      }
    }
    const [row] = yield* query((db) => db.update(venues).set(data).where(eq(venues.id, venueId)).returning());
    if (!row) return yield* notFound;
    yield* recordActivity({
      eventId: null,
      verb: "venue.updated",
      entityType: "venue",
      entityId: row.id,
      summary: `actualizó el espacio ${row.name}`,
    });

    return { id: row.id };
  });

/**
 * Staff mark a contact's mail as bouncing (no bounce webhook reaches OWU yet), or the person as
 * gone, or undo either; a space with nobody active left stops taking requests.
 */
export const manageContact = (contactId: string, data: { bounced?: boolean; left?: boolean; role?: string }) =>
  transaction(
    Effect.gen(function* () {
      const now = new Date();
      const [row] = yield* query((db) =>
        db
          .update(venueContacts)
          .set({
            ...(data.bounced === undefined ? {} : { bouncedAt: data.bounced ? now : null }),
            ...(data.left === undefined ? {} : { leftAt: data.left ? now : null }),
            ...(data.role === undefined ? {} : { role: data.role }),
          })
          .where(eq(venueContacts.id, contactId))
          .returning()
      );
      if (!row) return yield* new NotFound({ entity: "venue_contact", message: "Ese contacto no existe" });
      if ((yield* activeContactsOf(row.venueId)).length === 0) {
        yield* query((db) => db.update(venues).set({ requestable: false }).where(eq(venues.id, row.venueId)));
      }

      return { id: row.id };
    })
  );

/** Requests that went 72 h without an answer this last month: staff can nudge the space or the community. */
export const manageUnanswered = query((db) =>
  db
    .select({
      id: venueRequests.id,
      venueName: venues.name,
      communityName: communities.name,
      status: venueRequests.status,
      broadcastId: venueRequests.broadcastId,
      createdAt: venueRequests.createdAt,
    })
    .from(venueRequests)
    .innerJoin(venues, eq(venues.id, venueRequests.venueId))
    .innerJoin(communities, eq(communities.id, venueRequests.communityId))
    .where(
      and(
        inArray(venueRequests.status, ["pending", "expired"]),
        isNull(venueRequests.respondedAt),
        lt(venueRequests.createdAt, new Date(Date.now() - ANSWER_HOURS * HOUR_MS)),
        gt(venueRequests.createdAt, new Date(Date.now() - 30 * DAY_MS))
      )
    )
    .orderBy(desc(venueRequests.createdAt))
    .limit(100)
).pipe(
  Effect.map((rows) =>
    rows.map((row) => ({
      id: row.id,
      venueName: row.venueName,
      communityName: row.communityName,
      status: row.status,
      broadcast: row.broadcastId !== null,
      createdAt: row.createdAt.toISOString(),
    }))
  )
);

export const manageRemove = (venueId: string) =>
  query((db) => db.delete(venues).where(eq(venues.id, venueId)).returning({ id: venues.id })).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed({ id: row.id }) : Effect.fail(notFound)))
  );
