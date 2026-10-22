import { and, asc, count, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { Effect } from "effect";

import { dayKey, montevideoIso, shortWhen } from "../../community/time";
import {
  communities,
  events,
  user,
  venueContacts,
  venueRequests,
  venues,
  type VenueRequestOption,
  type VenueRequestRow,
  type VenueRow,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, venueAnsweredHostEmail, venueRequestEmail, venueResponseEmail } from "../../email/templates";
import { readLink, signLink } from "../../links";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { recordActivity } from "../ops";
import { CommunityScope, CurrentUser } from "../services";
import { fullMonths, rankVenues, venueFit } from "../../organizar/venue-fit";
import type {
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
const ANSWER_HOURS = 72;
/** The link keeps opening (to show what happened) a while after the request closes. */
const LINK_DAYS = 30;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

const toVenue = (row: VenueRow, hostedUs = 0): Venue => ({
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
});

const notFound = new NotFound({ entity: "venue", message: "Ese espacio no existe" });
const requestNotFound = new NotFound({ entity: "venue_request", message: "Ese pedido no existe" });

/**
 * The active spaces for an event, best first (see venue-fit): what doesn't work for its size, needs
 * or day goes last with the reason, and among the rest the best fit and who hosted least recently.
 */
export const list = (input: VenueListInput) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db.select().from(venues).where(eq(venues.status, "active")).orderBy(asc(venues.name))
    );
    const yearAgo = new Date(Date.now() - 365 * DAY_MS);
    const [requests, hosted] = yield* Effect.all([
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
    ]);
    const busy = yield* Effect.forEach(rows, (row) => busyDays(row.id));
    const now = Date.now();

    const ranked = rankVenues(
      rows.map((row, at) => {
        const theirs = requests.filter((request) => request.venueId === row.id);
        const asked = theirs.filter((request) => request.createdAt > yearAgo && request.status !== "cancelled");
        const answered = asked.filter((request) => request.status === "accepted" || request.status === "declined");
        const lastHosted = hosted
          .filter((event) => event.venueId === row.id && event.startDate.getTime() <= now)
          .reduce<Date | null>((last, event) => (!last || event.startDate > last ? event.startDate : last), null);
        const ours = theirs.filter(
          (request) => request.communityId === input.communityId && request.status === "accepted"
        ).length;
        const venue = toVenue(row, ours);
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

        return { ...venue, fit };
      })
    );

    return ranked.map(({ fit, ...venue }): RankedVenue => ({
      ...venue,
      fit: { blockers: fit.blockers, missing: fit.missing as RankedVenue["fit"]["missing"] },
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
  query((db) => db.select().from(venueContacts).where(eq(venueContacts.venueId, venueId)));

const toRequest = (
  row: VenueRequestRow,
  venue: Pick<VenueRow, "id" | "name" | "neighbourhood" | "address">,
  contact: { name: string; email: string } | null
): VenueRequest => {
  const accepted = row.status === "accepted";

  return {
    id: row.id,
    venue: { id: venue.id, name: venue.name, neighbourhood: venue.neighbourhood },
    eventId: row.eventId,
    options: row.options,
    expectedAttendees: row.expectedAttendees,
    message: row.message,
    status: row.status,
    chosenOption: row.chosenOption,
    hostMessage: row.hostMessage,
    address: accepted ? venue.address || null : null,
    contact: accepted && row.shareContact ? contact : null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
};

const optionLabel = (option: VenueRequestOption) => shortWhen(option.start);

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

      const options = input.options.map((option): VenueRequestOption => {
        const start = new Date(montevideoIso(`${option.day}T${option.startTime}`));

        return {
          start: start.toISOString(),
          end: new Date(start.getTime() + option.durationMin * 60_000).toISOString(),
        };
      });
      if (options.some((option) => Date.parse(option.start) < Date.now())) {
        return yield* new Invalid({ message: "Una de las fechas ya pasó" });
      }
      const notice = Date.now() + venue.leadDays * DAY_MS;
      const rushed = input.options.find((option) => Date.parse(montevideoIso(`${option.day}T23:59`)) < notice);
      if (rushed) {
        return yield* new Invalid({ message: `${venue.name} pide al menos ${venue.leadDays} días de anticipación` });
      }
      const full = fullMonths(yield* busyDays(venue.id), venue.monthlyCap);
      const crowded = input.options.find((option) => full.includes(option.day.slice(0, 7)));
      if (crowded) {
        return yield* new Invalid({
          message: `${venue.name} ya recibe ${venue.monthlyCap} ${venue.monthlyCap === 1 ? "meetup" : "meetups"} ese mes: probá otro mes`,
        });
      }
      if (venue.hostDays.length > 0) {
        const off = input.options.find(
          (option) => !venue.hostDays.includes(new Date(`${option.day}T12:00:00Z`).getUTCDay())
        );
        if (off) {
          const days = venue.hostDays.toSorted((a, b) => a - b).map((day) => WEEKDAYS[day]);
          return yield* new Invalid({ message: `${venue.name} recibe solo los ${days.join(", ")}` });
        }
      }

      const [open] = yield* query((db) =>
        db
          .select({ id: venueRequests.id })
          .from(venueRequests)
          .where(
            and(
              eq(venueRequests.venueId, venue.id),
              eq(venueRequests.communityId, communityId),
              eq(venueRequests.status, "pending")
            )
          )
      );
      if (open) {
        return yield* new Conflict({
          reason: "already_pending",
          message: `Ya le pediste a ${venue.name}: esperá su respuesta o cancelá ese pedido`,
        });
      }
      const contacts = yield* contactsOf(venue.id);
      if (contacts.length === 0) {
        return yield* new Conflict({ reason: "not_requestable", message: "Este espacio no tiene contacto todavía" });
      }

      const expiresAt = new Date(Date.now() + ANSWER_HOURS * HOUR_MS);
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
            expiresAt,
          })
          .returning()
      );
      const [community] = yield* query((db) =>
        db.select({ name: communities.name }).from(communities).where(eq(communities.id, communityId))
      );
      const token = yield* Effect.promise(() =>
        signLink("venue-request", row.id, new Date(expiresAt.getTime() + LINK_DAYS * 24 * HOUR_MS))
      );
      for (const contact of contacts) {
        yield* enqueueEmail({
          kind: "venue_request",
          to: contact.email,
          priority: 2,
          dedupeKey: `venue_request:${row.id}:${contact.email}`,
          ...venueRequestEmail({
            venue: venue.name,
            community: community?.name ?? "Una comunidad",
            organizer: me.name.split(" ")[0] ?? "",
            options: options.map(optionLabel),
            expectedAttendees: input.expectedAttendees,
            message: input.message,
            until: shortWhen(expiresAt),
            link: appUrl(`/espacios/pedido/${token}`),
          }),
        });
      }
      yield* recordActivity({
        eventId: input.eventId ?? null,
        verb: "venue.requested",
        entityType: "venue_request",
        entityId: row.id,
        summary: `le pidió espacio a ${venue.name} para ${options.length === 1 ? "una fecha" : `${options.length} fechas`}`,
      });

      return toRequest(row, venue, null);
    })
  );

/** The community's requests, newest first. */
export const requests = (communityId: string) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select({ request: venueRequests, venue: venues })
        .from(venueRequests)
        .innerJoin(venues, eq(venues.id, venueRequests.venueId))
        .where(eq(venueRequests.communityId, communityId))
        .orderBy(desc(venueRequests.createdAt))
        .limit(50)
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
          )
        : [];

    return rows.map((row) => {
      const contact = contacts.find((candidate) => candidate.venueId === row.venue.id);

      return toRequest(row.request, row.venue, contact ? { name: contact.name, email: contact.email } : null);
    });
  });

/** Withdraw a request still waiting for an answer. */
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

const fromToken = (token: string) =>
  Effect.promise(() => readLink("venue-request", token)).pipe(
    Effect.flatMap((id) => (id ? Effect.succeed(id) : Effect.fail(requestNotFound)))
  );

/** A pending request past its deadline reads as expired, even before the sweep marks it. */
const effectiveStatus = (row: VenueRequestRow) =>
  row.status === "pending" && row.expiresAt.getTime() < Date.now() ? ("expired" as const) : row.status;

/** What the host's link shows. */
export const byToken = (token: string) =>
  Effect.gen(function* () {
    const id = yield* fromToken(token);
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
        .where(eq(venueRequests.id, id))
    );
    if (!row) return yield* requestNotFound;

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
      expiresAt: row.request.expiresAt.toISOString(),
      addressVisibility: row.addressVisibility,
    };
  });

/**
 * The host's answer, from the link. Accepting takes one of the dates, dates and places the event
 * when there is one, and only then do the two sides get each other's email.
 */
export const respond = (input: RespondInput) =>
  Effect.gen(function* () {
    const id = yield* fromToken(input.token);

    return yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db.select().from(venueRequests).where(eq(venueRequests.id, id)).for("update")
        );
        if (!row) return yield* requestNotFound;
        const status = effectiveStatus(row);
        if (status === "expired") {
          return yield* new Conflict({
            reason: "expired",
            message: "El pedido venció: la comunidad ya buscó otro lugar",
          });
        }
        if (status !== "pending") {
          return yield* new Conflict({ reason: "already_answered", message: "Este pedido ya tiene respuesta" });
        }
        const chosen = input.decision === "accept" ? row.options[input.option] : undefined;
        if (input.decision === "accept" && !chosen)
          return yield* new Invalid({ message: "Esa fecha no está en el pedido" });

        const [updated] = yield* query((db) =>
          db
            .update(venueRequests)
            .set({
              status: input.decision === "accept" ? "accepted" : "declined",
              chosenOption: input.decision === "accept" ? input.option : null,
              hostMessage: input.hostMessage || null,
              shareContact: input.decision === "accept" ? input.shareContact : false,
              respondedAt: new Date(),
            })
            .where(eq(venueRequests.id, id))
            .returning()
        );
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
        const contacts = yield* contactsOf(row.venueId);

        if (chosen && row.eventId) {
          const [event] = yield* query((db) =>
            db
              .select()
              .from(events)
              .where(eq(events.id, row.eventId ?? ""))
          );
          if (event) {
            const draft = event.status === "draft";
            const holdUntil = new Date(Date.now() + 14 * 24 * HOUR_MS);
            yield* query((db) =>
              db
                .update(events)
                .set({
                  venueId: row.venueId,
                  ...(draft
                    ? {
                        startDate: new Date(chosen.start),
                        endDate: new Date(chosen.end),
                        heldUntil: event.heldUntil && event.heldUntil > holdUntil ? event.heldUntil : holdUntil,
                      }
                    : {}),
                })
                .where(eq(events.id, event.id))
            );
          }
        }

        if (organizer && venue && community) {
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
              contact:
                chosen && input.decision === "accept" && input.shareContact && contacts[0]
                  ? { name: contacts[0].name, email: contacts[0].email }
                  : null,
              panelPath: `/organizar/panel/${community.slug}/espacios`,
            }),
          });
          if (chosen) {
            for (const contact of contacts) {
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
          verb: chosen ? "venue.accepted" : "venue.declined",
          entityType: "venue_request",
          entityId: row.id,
          summary: chosen
            ? `${venue?.name ?? "El espacio"} aceptó recibir el ${shortWhen(chosen.start)}`
            : `${venue?.name ?? "El espacio"} no puede recibir esta vez`,
        });

        return { status: updated.status };
      })
    );
  });

/** Requests nobody answered in time: closed, and their organizer told to look elsewhere. */
export const expireRequests = Effect.gen(function* () {
  const expired = yield* query((db) =>
    db
      .update(venueRequests)
      .set({ status: "expired" })
      .where(and(eq(venueRequests.status, "pending"), lt(venueRequests.expiresAt, new Date())))
      .returning()
  );
  for (const row of expired) {
    if (!row.requestedById) continue;
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
            submittedById: me.id,
          })
          .returning()
      );
      yield* query((db) =>
        db.insert(venueContacts).values({
          venueId: row.id,
          userId: me.id,
          name: me.name,
          email: account?.email ?? "",
          consentAt: new Date(),
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
  const contacts = yield* query((db) => db.select().from(venueContacts));

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
        consentAt: contact.consentAt.toISOString(),
      })),
    createdAt: row.createdAt.toISOString(),
  }));
});

export const manageUpdate = (
  venueId: string,
  data: Partial<
    Pick<VenueRow, "status" | "requestable" | "fallback" | "name" | "neighbourhood" | "address" | "capacity" | "notes">
  >
) =>
  Effect.gen(function* () {
    if (data.requestable) {
      const contacts = yield* contactsOf(venueId);
      if (contacts.length === 0) {
        return yield* new Conflict({
          reason: "no_contact",
          message: "Para recibir pedidos el espacio necesita un contacto que haya aceptado",
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

export const manageRemove = (venueId: string) =>
  query((db) => db.delete(venues).where(eq(venues.id, venueId)).returning({ id: venues.id })).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed({ id: row.id }) : Effect.fail(notFound)))
  );
