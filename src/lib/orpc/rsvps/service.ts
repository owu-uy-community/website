import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { Effect } from "effect";

import { buildInvite } from "../../community/ics";
import { shortWhen } from "../../community/time";
import {
  attendees,
  communities,
  emailDeliveries,
  emailSuppressions,
  events,
  surveys,
  user,
  venues,
  type AttendeeRow,
  type EventRow,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, rsvpEmail, type RsvpEmailKind } from "../../email/templates";
import { readLink, signLink, unsubscribeToken } from "../../links";
import { ticketCode } from "../../organizar/ticket";
import { eventPagePath, refreshPage } from "../../revalidate";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { opsPing, recordActivity } from "../ops";
import { CommunityScope, CurrentUser } from "../services";
import type { JoinInput, MyRsvp, Ticket } from "./schemas";

const HOUR_MS = 3_600_000;
/** People with a seat: what the capacity counts */
const SEATED = ["attending", "offered"] as const;
/** People still in: a repeated join returns their place instead of making another */
const ACTIVE = ["attending", "offered", "waitlisted", "pending"] as const;

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });
const rsvpNotFound = new NotFound({ entity: "rsvp", message: "No encontramos esa inscripción" });

type EventContext = EventRow & {
  community: { name: string; slug: string };
  venue: { name: string; neighbourhood: string; address: string } | null;
};

/** The event row, locked: every path that changes who has a seat goes through here first. */
const lockEvent = (eventId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) => db.select().from(events).where(eq(events.id, eventId)).for("update"));
    if (!row) return yield* eventNotFound;

    return row;
  });

const contextOf = (event: EventRow) =>
  Effect.gen(function* () {
    const [community] = yield* query((db) =>
      db
        .select({ name: communities.name, slug: communities.slug })
        .from(communities)
        .where(eq(communities.id, event.communityId))
    );
    const [venue] = event.venueId
      ? yield* query((db) =>
          db
            .select({ name: venues.name, neighbourhood: venues.neighbourhood, address: venues.address })
            .from(venues)
            .where(eq(venues.id, event.venueId ?? ""))
        )
      : [];

    return { ...event, community: community ?? { name: "", slug: "" }, venue: venue ?? null } satisfies EventContext;
  });

/** Seats taken right now (with +1s). Read after locking the event, in a statement of its own. */
const seatsTaken = (eventId: string) =>
  query((db) =>
    db
      .select({ taken: sql<number>`coalesce(sum(1 + ${attendees.guests}), 0)`.mapWith(Number) })
      .from(attendees)
      .where(and(eq(attendees.eventId, eventId), eq(attendees.source, "owu"), inArray(attendees.status, [...SEATED])))
  ).pipe(Effect.map(([row]) => row?.taken ?? 0));

/** Where an attendee is, with the full address (people with a seat get it whatever the host shows) */
const placeFor = (event: EventContext, seated: boolean) =>
  event.mode === "online"
    ? "Online"
    : event.venue
      ? [event.venue.name, seated ? event.venue.address || event.venue.neighbourhood : event.venue.neighbourhood]
          .filter(Boolean)
          .join(", ")
      : event.placeName
        ? [event.placeName, event.placeAddress].filter(Boolean).join(", ")
        : "Lugar a confirmar";

const pageUrl = (event: EventContext) => appUrl(`/comunidad/${event.community.slug}/events/${event.slug}`);

const positionOf = (row: AttendeeRow) =>
  row.status !== "waitlisted"
    ? Effect.succeed(null)
    : query((db) =>
        db
          .select({ ahead: sql<number>`count(*)`.mapWith(Number) })
          .from(attendees)
          .where(
            and(
              eq(attendees.eventId, row.eventId),
              eq(attendees.status, "waitlisted"),
              or(
                lt(attendees.registeredAt, row.registeredAt ?? new Date()),
                and(eq(attendees.registeredAt, row.registeredAt ?? new Date()), lt(attendees.id, row.id))
              )
            )
          )
      ).pipe(Effect.map(([result]) => (result?.ahead ?? 0) + 1));

const toMine = (row: AttendeeRow, event: EventContext) =>
  Effect.gen(function* () {
    const seated = row.status === "attending";

    return {
      id: row.id,
      status: row.status,
      guests: row.guests,
      registeredAt: row.registeredAt?.toISOString() ?? null,
      offerExpiresAt: row.offerExpiresAt?.toISOString() ?? null,
      position: yield* positionOf(row),
      code: seated ? row.barcode : null,
      address: seated && event.mode !== "online" ? placeFor(event, true) : null,
      onlineUrl: seated && event.mode !== "presencial" ? event.onlineUrl : null,
      checkedInAt: row.checkedInAt?.toISOString() ?? null,
    } satisfies MyRsvp;
  });

/** Reminders and feedback: the person can turn these off; everything else is essential */
const OPTIONAL: RsvpEmailKind[] = ["reminder_48h", "reminder_2h", "feedback"];
/** Emails that put the event in the person's calendar, or take it out */
const ADDS: RsvpEmailKind[] = ["confirmed", "promoted", "updated"];
const REMOVES: RsvpEmailKind[] = ["left", "event_cancelled"];
/** Emails for someone with a seat: QR, full address, online link */
const SEATED_KINDS: RsvpEmailKind[] = ["confirmed", "promoted", "reminder_2h", "updated"];

const suppressed = (email: string) =>
  query((db) =>
    db
      .select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(and(eq(emailSuppressions.email, email.toLowerCase()), eq(emailSuppressions.scope, "reminders")))
      .limit(1)
  ).pipe(Effect.map((rows) => rows.length > 0));

/**
 * Queue the email for where the person stands now. Seats come with the calendar invite and the
 * QR; the dedupe key (this registration, or the caller's) sends each one once.
 */
const notify = (row: AttendeeRow, event: EventContext, kind: RsvpEmailKind, dedupeKey?: string) =>
  Effect.gen(function* () {
    const optional = OPTIONAL.includes(kind);
    if (optional && (yield* suppressed(row.email))) return;
    const token = yield* Effect.promise(() => signLink("ticket", row.id));
    const unsubscribe = optional
      ? yield* Effect.promise(() => unsubscribeToken(row.email.toLowerCase(), "reminders"))
      : null;
    // Seat details (QR, address, online link, the invite) only for someone who has the seat
    const seated = SEATED_KINDS.includes(kind) && row.status === "attending";
    const removed = REMOVES.includes(kind);
    const ticketUrl = appUrl(`/comunidad/${event.community.slug}/events/${event.slug}/entrada?t=${token}`);
    const invite =
      (ADDS.includes(kind) && seated) || removed
        ? buildInvite({
            uid: `rsvp-${event.id}@owu.uy`,
            // Leaving outranks the invite they have; a cancelled event already moved the sequence
            sequence: event.icsSequence + (kind === "left" ? 1 : 0),
            method: removed ? "CANCEL" : "REQUEST",
            title: event.name,
            start: event.startDate.toISOString(),
            end: event.endDate.toISOString(),
            location: placeFor(event, true),
            url: pageUrl(event),
            description: `${event.summary ?? ""}\n\nTu entrada: ${ticketUrl}`,
            organizer: { name: event.community.name, email: "hola@mail.owu.uy" },
            attendee: { name: row.name, email: row.email },
          })
        : null;

    yield* enqueueEmail({
      kind: `rsvp_${kind}`,
      to: row.email,
      priority: kind === "offered" || kind === "promoted" || kind === "event_cancelled" ? 1 : optional ? 5 : 3,
      dedupeKey:
        dedupeKey ??
        `rsvp_${kind}:${row.id}:${(row.registeredAt ?? new Date()).getTime()}:${row.offerExpiresAt?.getTime() ?? 0}`,
      headers: unsubscribe
        ? {
            "List-Unsubscribe": `<${appUrl(`/api/email/unsubscribe?t=${unsubscribe}`)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
      attachments: invite
        ? [
            {
              filename: "invitacion.ics",
              content: Buffer.from(invite).toString("base64"),
              contentType: `text/calendar; charset=utf-8; method=${removed ? "CANCEL" : "REQUEST"}`,
            },
          ]
        : [],
      ...rsvpEmail({
        kind,
        name: row.name,
        event: event.name,
        community: event.community.name,
        when: shortWhen(event.startDate),
        place: placeFor(event, seated),
        onlineUrl: seated && event.mode !== "presencial" ? event.onlineUrl : null,
        ticketUrl,
        qrUrl: seated ? appUrl(`/api/tickets/qr?t=${token}`) : null,
        pageUrl: pageUrl(event),
        position: row.status === "waitlisted" ? yield* positionOf(row) : null,
        offerUntil: row.offerExpiresAt ? shortWhen(row.offerExpiresAt) : null,
        surveyUrl:
          kind === "feedback" ? appUrl(`/comunidad/${event.community.slug}/events/${event.slug}/encuesta`) : null,
        unsubscribeUrl: unsubscribe ? appUrl(`/email/baja?t=${unsubscribe}`) : null,
      }),
    });
  });

/** How long a freed seat waits for its person: shorter as the event gets closer; none inside a day. */
export const offerWindowMs = (start: Date, now = Date.now()) => {
  const hours = (start.getTime() - now) / HOUR_MS;

  return hours <= 24 ? 0 : hours > 72 ? 24 * HOUR_MS : 4 * HOUR_MS;
};

/**
 * Give freed seats to the waitlist, first come first served; a party that doesn't fit keeps its
 * place for the next seat. Inside 24 h the seat is theirs at once; before, it's offered for a
 * while. Call with the event locked.
 */
const promote = (event: EventContext) =>
  Effect.gen(function* () {
    if (event.capacity === null || event.status !== "published") return;
    let free = event.capacity - (yield* seatsTaken(event.id));
    if (free <= 0) return;
    const waiting = yield* query((db) =>
      db
        .select()
        .from(attendees)
        .where(and(eq(attendees.eventId, event.id), eq(attendees.status, "waitlisted")))
        .orderBy(asc(attendees.registeredAt), asc(attendees.id))
    );
    const window = offerWindowMs(event.startDate);
    for (const person of waiting) {
      const need = 1 + person.guests;
      if (need > free) continue;
      free -= need;
      const offerExpiresAt =
        window === 0 ? null : new Date(Math.min(Date.now() + window, event.startDate.getTime() - HOUR_MS));
      const [moved] = yield* query((db) =>
        db
          .update(attendees)
          .set({ status: window === 0 ? "attending" : "offered", offerExpiresAt })
          .where(eq(attendees.id, person.id))
          .returning()
      );
      yield* notify(moved, event, window === 0 ? "promoted" : "offered");
      if (free <= 0) break;
    }
  });

const openFor = (event: EventRow) => {
  if (event.status !== "published" || event.registration !== "owu") {
    return new Conflict({ reason: "closed", message: "Este evento no tiene inscripción abierta en OWU" });
  }
  if (event.endDate.getTime() < Date.now() || (event.rsvpClosesAt && event.rsvpClosesAt.getTime() < Date.now())) {
    return new Conflict({ reason: "closed", message: "La inscripción ya cerró" });
  }

  return null;
};

/**
 * Sign up: a seat if there's room (or the organizers' review when they approve each one), the
 * waitlist when full. One place per person: joining again returns it; after leaving, it's the
 * back of the line.
 */
export const join = (input: JoinInput) =>
  transaction(
    Effect.gen(function* () {
      const me = yield* CurrentUser;
      const event = yield* contextOf(yield* lockEvent(input.eventId));
      const closed = openFor(event);
      if (closed) return yield* closed;
      if (input.guests > event.guestsAllowed) {
        return yield* new Invalid({
          message: event.guestsAllowed
            ? `Hasta ${event.guestsAllowed} acompañantes`
            : "Este evento es sin acompañantes",
        });
      }
      const missing = event.questions.find((question) => question.required && !input.answers[question.id]?.trim());
      if (missing) return yield* new Invalid({ message: `Falta responder: ${missing.label}` });

      const [existing] = yield* query((db) =>
        db
          .select()
          .from(attendees)
          .where(and(eq(attendees.eventId, event.id), eq(attendees.userId, me.id)))
      );
      if (existing && (ACTIVE as readonly string[]).includes(existing.status)) return yield* toMine(existing, event);
      // A decline is the organizers' call: only they undo it (leaving yourself, or a lapsed offer, can re-join)
      if (existing?.status === "declined") {
        return yield* new Conflict({ reason: "declined", message: "Quienes organizan no confirmaron tu inscripción" });
      }

      const taken = yield* seatsTaken(event.id);
      const fits = event.capacity === null || taken + 1 + input.guests <= event.capacity;
      const status = event.approval ? "pending" : fits ? "attending" : event.waitlist ? "waitlisted" : null;
      if (!status) return yield* new Conflict({ reason: "full", message: "No quedan lugares" });

      const [account] = yield* query((db) =>
        db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, me.id))
      );
      if (!account?.name.trim()) {
        return yield* new Invalid({ message: "Poné tu nombre antes de anotarte: así te ven quienes organizan" });
      }
      const answers = Object.fromEntries(
        event.questions
          .filter((question) => input.answers[question.id])
          .map((question) => [question.id, input.answers[question.id]])
      );
      const fields = {
        status,
        guests: input.guests,
        answers,
        showName: input.showName,
        registeredAt: new Date(),
        offerExpiresAt: null,
        name: account.name,
        email: account.email,
      } as const;
      const [row] = existing
        ? yield* query((db) => db.update(attendees).set(fields).where(eq(attendees.id, existing.id)).returning())
        : yield* query((db) =>
            db
              .insert(attendees)
              .values({
                eventId: event.id,
                source: "owu",
                userId: me.id,
                ticketClass: "General",
                barcode: ticketCode(),
                ...fields,
              })
              .returning()
          );
      yield* notify(row, event, status === "attending" ? "confirmed" : status);
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return yield* toMine(row, event);
    })
  );

/** Give the seat (or the waitlist place) back; the next person in line gets it. */
const leaveRow = (attendeeId: string) =>
  transaction(
    Effect.gen(function* () {
      const [peek] = yield* query((db) =>
        db.select({ eventId: attendees.eventId }).from(attendees).where(eq(attendees.id, attendeeId))
      );
      if (!peek) return yield* rsvpNotFound;
      const event = yield* contextOf(yield* lockEvent(peek.eventId));
      const [row] = yield* query((db) => db.select().from(attendees).where(eq(attendees.id, attendeeId)));
      if (!row) return yield* rsvpNotFound;
      if (!(ACTIVE as readonly string[]).includes(row.status)) return yield* toMine(row, event);
      if (row.checkedInAt) return yield* new Conflict({ reason: "checked_in", message: "Ya entraste al evento" });

      const hadSeat = (SEATED as readonly string[]).includes(row.status);
      const [left] = yield* query((db) =>
        db
          .update(attendees)
          .set({ status: "cancelled", offerExpiresAt: null })
          .where(eq(attendees.id, row.id))
          .returning()
      );
      if (hadSeat) yield* notify(left, event, "left");
      yield* promote(event);
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return yield* toMine(left, event);
    })
  );

/** Take an offered seat while the offer lasts. */
const confirmRow = (attendeeId: string) =>
  transaction(
    Effect.gen(function* () {
      const [peek] = yield* query((db) =>
        db.select({ eventId: attendees.eventId }).from(attendees).where(eq(attendees.id, attendeeId))
      );
      if (!peek) return yield* rsvpNotFound;
      const event = yield* contextOf(yield* lockEvent(peek.eventId));
      const [row] = yield* query((db) => db.select().from(attendees).where(eq(attendees.id, attendeeId)));
      if (!row) return yield* rsvpNotFound;
      if (row.status === "attending") return yield* toMine(row, event);
      if (row.status !== "offered" || !row.offerExpiresAt || row.offerExpiresAt.getTime() < Date.now()) {
        return yield* new Conflict({
          reason: "offer_expired",
          message: "El lugar que te ofrecimos ya no está disponible",
        });
      }
      const [seated] = yield* query((db) =>
        db
          .update(attendees)
          .set({ status: "attending", offerExpiresAt: null })
          .where(eq(attendees.id, row.id))
          .returning()
      );
      yield* notify(seated, event, "confirmed");
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return yield* toMine(seated, event);
    })
  );

const mineFor = (eventId: string) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const [row] = yield* query((db) =>
      db
        .select()
        .from(attendees)
        .where(and(eq(attendees.eventId, eventId), eq(attendees.userId, me.id)))
    );

    return row ?? null;
  });

export const mine = (eventId: string) =>
  Effect.gen(function* () {
    const row = yield* mineFor(eventId);
    if (!row) return null;
    const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, eventId)));
    if (!event) return yield* eventNotFound;

    return yield* toMine(row, yield* contextOf(event));
  });

export const leave = (eventId: string) =>
  Effect.gen(function* () {
    const row = yield* mineFor(eventId);
    if (!row) return yield* rsvpNotFound;

    return yield* leaveRow(row.id);
  });

export const confirmOffer = (eventId: string) =>
  Effect.gen(function* () {
    const row = yield* mineFor(eventId);
    if (!row) return yield* rsvpNotFound;

    return yield* confirmRow(row.id);
  });

const fromToken = (token: string) =>
  Effect.promise(() => readLink("ticket", token)).pipe(
    Effect.flatMap((id) => (id ? Effect.succeed(id) : Effect.fail(rsvpNotFound)))
  );

/** The ticket page from a signed link (the emails' "Ver mi entrada"), no session needed. */
export const ticket = (token: string) =>
  Effect.gen(function* () {
    const id = yield* fromToken(token);
    const [row] = yield* query((db) => db.select().from(attendees).where(eq(attendees.id, id)));
    if (!row) return yield* rsvpNotFound;
    const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, row.eventId)));
    if (!event) return yield* eventNotFound;
    const context = yield* contextOf(event);

    return {
      rsvp: yield* toMine(row, context),
      name: row.name,
      token,
      event: {
        name: event.name,
        slug: event.slug,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        status: event.status,
        place: placeFor(context, row.status === "attending"),
        community: context.community,
      },
    } satisfies Ticket;
  });

/** The signed-in person's ticket for an event, with a fresh signed link for the QR. */
export const myTicket = (eventId: string) =>
  Effect.gen(function* () {
    const row = yield* mineFor(eventId);
    if (!row) return null;

    return yield* ticket(yield* Effect.promise(() => signLink("ticket", row.id)));
  });

export const leaveByToken = (token: string) => fromToken(token).pipe(Effect.flatMap(leaveRow));
export const confirmByToken = (token: string) => fromToken(token).pipe(Effect.flatMap(confirmRow));

/** Every event the person signed up for, offers first, then what's next. */
export const myEvents = Effect.gen(function* () {
  const me = yield* CurrentUser;
  const rows = yield* query((db) =>
    db
      .select({ attendee: attendees, event: events, community: { name: communities.name, slug: communities.slug } })
      .from(attendees)
      .innerJoin(events, eq(events.id, attendees.eventId))
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(and(eq(attendees.userId, me.id), eq(attendees.source, "owu")))
      .orderBy(desc(events.startDate))
      .limit(100)
  );
  const list = [];
  for (const row of rows) {
    const context = { ...row.event, community: row.community, venue: null };
    list.push({
      rsvp: yield* toMine(row.attendee, context),
      event: {
        id: row.event.id,
        name: row.event.name,
        slug: row.event.slug,
        startDate: row.event.startDate.toISOString(),
        status: row.event.status,
        community: row.community,
      },
    });
  }

  return list.toSorted((a, b) => Number(b.rsvp.status === "offered") - Number(a.rsvp.status === "offered"));
});

/** The organizers approve or turn down someone waiting for review. */
export const review = (input: { eventId: string; attendeeId: string; decision: "approve" | "decline" }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const event = yield* contextOf(yield* lockEvent(input.eventId));
      if (event.communityId !== communityId) return yield* eventNotFound;
      const [row] = yield* query((db) =>
        db
          .select()
          .from(attendees)
          .where(and(eq(attendees.id, input.attendeeId), eq(attendees.eventId, event.id)))
      );
      if (!row) return yield* rsvpNotFound;
      if (row.status !== "pending")
        return yield* new Conflict({ reason: "not_pending", message: "Esa inscripción ya se revisó" });

      let status: AttendeeRow["status"] = "declined";
      if (input.decision === "approve") {
        const fits = event.capacity === null || (yield* seatsTaken(event.id)) + 1 + row.guests <= event.capacity;
        status = fits ? "attending" : "waitlisted";
      }
      const [reviewed] = yield* query((db) =>
        db
          .update(attendees)
          .set({ status, registeredAt: status === "waitlisted" ? new Date() : row.registeredAt })
          .where(eq(attendees.id, row.id))
          .returning()
      );
      yield* notify(
        reviewed,
        event,
        status === "attending" ? "confirmed" : status === "waitlisted" ? "waitlisted" : "declined"
      );
      yield* recordActivity({
        eventId: event.id,
        verb: input.decision === "approve" ? "rsvp.approved" : "rsvp.declined",
        entityType: "attendee",
        entityId: row.id,
        summary: input.decision === "approve" ? `aprobó a ${row.name}` : `no aprobó a ${row.name}`,
      });
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return yield* toMine(reviewed, event);
    })
  );

/** Offers nobody took in time: the seat goes to the next in line (from the tick). */
export const expireOffers = Effect.gen(function* () {
  const due = yield* query((db) =>
    db
      .selectDistinct({ eventId: attendees.eventId })
      .from(attendees)
      .where(and(eq(attendees.status, "offered"), lt(attendees.offerExpiresAt, new Date())))
  );
  let expired = 0;
  for (const { eventId } of due) {
    expired += yield* transaction(
      Effect.gen(function* () {
        const event = yield* contextOf(yield* lockEvent(eventId));
        const lapsed = yield* query((db) =>
          db
            .update(attendees)
            .set({ status: "cancelled", offerExpiresAt: null })
            .where(
              and(
                eq(attendees.eventId, eventId),
                eq(attendees.status, "offered"),
                lt(attendees.offerExpiresAt, new Date())
              )
            )
            .returning()
        );
        for (const row of lapsed) yield* notify(row, event, "offer_expired");
        yield* promote(event);

        return lapsed.length;
      })
    );
  }

  return { expired };
});

// ---------------------------------------------------------------------------
// Time-driven emails (from the tick) and telling people about changes
// ---------------------------------------------------------------------------

/** Which of these dedupe keys already have an email queued or sent (so the sweep skips them early) */
const queued = (keys: string[]) =>
  keys.length === 0
    ? Effect.succeed(new Set<string>())
    : query((db) =>
        db
          .select({ key: emailDeliveries.dedupeKey })
          .from(emailDeliveries)
          .where(inArray(emailDeliveries.dedupeKey, keys))
      ).pipe(Effect.map((rows) => new Set(rows.map((row) => row.key))));

const seatedAt = (where: ReturnType<typeof and>) =>
  query((db) =>
    db
      .select({ attendee: attendees, event: events })
      .from(attendees)
      .innerJoin(events, eq(events.id, attendees.eventId))
      .where(and(eq(attendees.status, "attending"), eq(attendees.source, "owu"), eq(events.status, "published"), where))
  );

/**
 * Two days before, a reconfirmation (with "No puedo ir" a click away) for people who signed up at
 * least 12 hours earlier; two hours before, how to get there. Keyed to the start time, so a moved
 * event reminds again for its new date.
 */
export const sendReminders = Effect.gen(function* () {
  const now = Date.now();
  const rows = yield* seatedAt(
    and(gt(events.startDate, new Date(now)), lt(events.startDate, new Date(now + 48 * HOUR_MS)))
  );
  const due = rows.flatMap(({ attendee, event }) => {
    const hours = (event.startDate.getTime() - now) / HOUR_MS;
    const settled = attendee.registeredAt !== null && now - attendee.registeredAt.getTime() > 12 * HOUR_MS;
    const kind = hours <= 2 ? ("reminder_2h" as const) : settled ? ("reminder_48h" as const) : null;

    return kind ? [{ attendee, event, kind, key: `${kind}:${attendee.id}:${event.startDate.getTime()}` }] : [];
  });
  const done = yield* queued(due.map((item) => item.key));
  const contexts = new Map<string, EventContext>();
  let sent = 0;
  for (const item of due.filter((entry) => !done.has(entry.key))) {
    const context = contexts.get(item.event.id) ?? (yield* contextOf(item.event));
    contexts.set(item.event.id, context);
    yield* notify(item.attendee, context, item.kind, item.key);
    sent += 1;
  }

  return { reminders: sent };
});

/** Between 2 and 26 hours after it ends, attendees get the event's survey, when it has one open. */
export const sendFeedback = Effect.gen(function* () {
  const now = Date.now();
  const rows = yield* query((db) =>
    db
      .select({ attendee: attendees, event: events })
      .from(attendees)
      .innerJoin(events, eq(events.id, attendees.eventId))
      .innerJoin(surveys, and(eq(surveys.eventId, events.id), eq(surveys.isOpen, true)))
      .where(
        and(
          eq(attendees.status, "attending"),
          eq(attendees.source, "owu"),
          eq(events.status, "published"),
          lt(events.endDate, new Date(now - 2 * HOUR_MS)),
          gt(events.endDate, new Date(now - 26 * HOUR_MS))
        )
      )
  );
  const done = yield* queued(rows.map(({ attendee }) => `feedback:${attendee.id}`));
  const contexts = new Map<string, EventContext>();
  let sent = 0;
  for (const { attendee, event } of rows.filter((row) => !done.has(`feedback:${row.attendee.id}`))) {
    const context = contexts.get(event.id) ?? (yield* contextOf(event));
    contexts.set(event.id, context);
    yield* notify(attendee, context, "feedback", `feedback:${attendee.id}`);
    sent += 1;
  }

  return { feedback: sent };
});

/**
 * A published event whose date or place changed tells its people once things settle (10 minutes
 * after the last edit), with the invite updated in their calendar.
 */
export const sendUpdates = Effect.gen(function* () {
  const changed = yield* query((db) =>
    db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.status, "published"),
          sql`${events.icsSequence} > ${events.notifiedSequence}`,
          lt(events.updatedAt, new Date(Date.now() - 10 * 60_000))
        )
      )
  );
  let told = 0;
  for (const { id } of changed) {
    told += yield* transaction(
      Effect.gen(function* () {
        const event = yield* contextOf(yield* lockEvent(id));
        const people = yield* query((db) =>
          db
            .select()
            .from(attendees)
            .where(and(eq(attendees.eventId, id), inArray(attendees.status, [...SEATED])))
        );
        for (const person of people) {
          yield* notify(person, event, "updated", `event_updated:${person.id}:${event.icsSequence}`);
        }
        // Keep updatedAt: an organizer editing right now must not read this as someone else's save
        yield* query((db) =>
          db
            .update(events)
            .set({ notifiedSequence: event.icsSequence, updatedAt: event.updatedAt })
            .where(eq(events.id, id))
        );

        return people.length;
      })
    );
  }

  return { updated: told };
});

/** A cancelled event tells everyone signed up at once, and takes it out of their calendars. Call it locked. */
/** After the organizers make room (more seats, or no limit): the waitlist moves up, first come first served. */
export const seatsChanged = (eventId: string) =>
  Effect.gen(function* () {
    const event = yield* contextOf(yield* lockEvent(eventId));
    yield* promote(event);
    yield* opsPing(event.id, "checkins");
  });

export const notifyCancelled = (eventId: string) =>
  Effect.gen(function* () {
    const event = yield* contextOf(yield* lockEvent(eventId));
    const people = yield* query((db) =>
      db
        .select()
        .from(attendees)
        .where(and(eq(attendees.eventId, eventId), inArray(attendees.status, [...ACTIVE])))
    );
    for (const person of people) yield* notify(person, event, "event_cancelled", `event_cancelled:${person.id}`);
    yield* query((db) =>
      db
        .update(events)
        .set({ notifiedSequence: event.icsSequence, updatedAt: event.updatedAt })
        .where(eq(events.id, eventId))
    );

    return people.length;
  });
