import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
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
import { firstTimeEmail, noShowNudgeEmail } from "../../email/attendance-templates";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, rsvpEmail, type OtherEvent, type RsvpEmailKind } from "../../email/templates";
import { readLink, signLink, unsubscribeToken } from "../../links";
import { NUDGE_AFTER_NO_SHOWS } from "../../organizar/attendance";
import { signupClosesAt } from "../../organizar/rsvp-state";
import { ticketCode } from "../../organizar/ticket";
import { eventPagePath, refreshPage } from "../../revalidate";
import { doorUsedAt, historyOf, labelled, seesSensitive } from "../attendees/history";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { opsPing, recordActivity } from "../ops";
import { CommunityScope, CurrentUser } from "../services";
import type { JoinInput, MyRsvp, Pending, Ticket } from "./schemas";

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

/** The event says where it happens (a space or an address), or nothing yet */
const hasPlace = (event: EventContext) => event.mode !== "online" && Boolean(event.venue ?? event.placeName);

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
      // Only an address worth reading: "Lugar a confirmar" isn't one
      address: seated && hasPlace(event) ? placeFor(event, true) : null,
      onlineUrl: seated && event.mode !== "presencial" ? event.onlineUrl : null,
      checkedInAt: row.checkedInAt?.toISOString() ?? null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
    } satisfies MyRsvp;
  });

/** Reminders and feedback: the person can turn these off; everything else is essential */
const OPTIONAL: RsvpEmailKind[] = ["reminder_48h", "reminder_2h", "feedback", "confirm_ping"];
/** The ones that ask "¿Seguís yendo?" with "Voy" and "No puedo ir" a tap away */
const ASKS: RsvpEmailKind[] = ["reminder_48h", "confirm_ping"];
/** The ones with "Otros eventos de OWU esta semana" at the bottom */
const REMINDERS: RsvpEmailKind[] = ["reminder_48h", "reminder_2h", "confirm_ping"];
/** Emails that put the event in the person's calendar, or take it out */
const ADDS: RsvpEmailKind[] = ["confirmed", "promoted", "updated"];
const REMOVES: RsvpEmailKind[] = ["left", "removed", "event_cancelled"];
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
 * Reminders, feedback and the organizers' messages can be turned off in one click: null when
 * this address did, otherwise the headers and the link that do it.
 */
export const optionalMail = (email: string) =>
  Effect.gen(function* () {
    if (yield* suppressed(email)) return null;
    const token = yield* Effect.promise(() => unsubscribeToken(email.toLowerCase(), "reminders"));

    return {
      headers: {
        "List-Unsubscribe": `<${appUrl(`/api/email/unsubscribe?t=${token}`)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      url: appUrl(`/email/baja?t=${token}`),
    };
  });

type NotifyOptions = {
  /** This registration's own key by default */
  dedupeKey?: string;
  /** To an organizer, as is, without the invite */
  test?: boolean;
  /** For the reminders' footer */
  others?: OtherEvent[];
  /** People waiting for a seat, for "¿Seguís yendo?" */
  waiting?: number;
};

/** The ticket page from an email: plain, or asking "Voy" / "No puedo ir" (that link lapses at the start). */
const ticketLink = (event: EventContext, token: string, action?: "confirmar" | "liberar") =>
  appUrl(
    `/comunidad/${event.community.slug}/events/${event.slug}/entrada?t=${token}${action ? `&accion=${action}` : ""}`
  );

/**
 * Queue the email for where the person stands now. Seats come with the calendar invite and the
 * QR; the dedupe key (this registration, or the caller's) sends each one once. A `test` goes to
 * an organizer as is, without the invite.
 */
const notify = (row: AttendeeRow, event: EventContext, kind: RsvpEmailKind, options: NotifyOptions = {}) =>
  Effect.gen(function* () {
    const { dedupeKey, test = false } = options;
    if (!row.email) return;
    const optional = OPTIONAL.includes(kind);
    const optOut = optional ? yield* optionalMail(row.email) : null;
    if (optional && !optOut && !test) return;
    const token = yield* Effect.promise(() => signLink("ticket", row.id));
    // The one-tap answers expire when the event starts: an old reminder can't move anything after
    const asking = ASKS.includes(kind)
      ? yield* Effect.promise(() => signLink("ticket", row.id, event.startDate))
      : null;
    // Seat details (QR, address, online link, the invite) only for someone who has the seat
    const seated = SEATED_KINDS.includes(kind) && row.status === "attending";
    // Organizers taking someone's place withdraw the invite only if they had one (pass the row as it was)
    const removed = REMOVES.includes(kind) && (kind !== "removed" || row.status === "attending");
    const ticketUrl = ticketLink(event, token);
    const invite =
      !test && ((ADDS.includes(kind) && seated) || removed)
        ? buildInvite({
            uid: `rsvp-${event.id}@owu.uy`,
            // Leaving outranks the invite they have; a cancelled event already moved the sequence
            sequence: event.icsSequence + (kind === "left" || kind === "removed" ? 1 : 0),
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

    const content = rsvpEmail({
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
      note: event.reminderNote,
      unsubscribeUrl: optOut?.url ?? null,
      confirmUrl: asking ? ticketLink(event, asking, "confirmar") : null,
      releaseUrl: asking ? ticketLink(event, asking, "liberar") : null,
      waiting: options.waiting,
      others: REMINDERS.includes(kind) ? options.others : undefined,
      reason: event.cancelReason,
    });

    yield* enqueueEmail({
      kind: `rsvp_${kind}`,
      to: row.email,
      priority: kind === "offered" || kind === "promoted" || kind === "event_cancelled" ? 1 : optional ? 5 : 3,
      dedupeKey:
        dedupeKey ??
        `rsvp_${kind}:${row.id}:${(row.registeredAt ?? new Date()).getTime()}:${row.offerExpiresAt?.getTime() ?? 0}`,
      headers: optOut?.headers,
      attachments: invite
        ? [
            {
              filename: "invitacion.ics",
              content: Buffer.from(invite).toString("base64"),
              contentType: `text/calendar; charset=utf-8; method=${removed ? "CANCEL" : "REQUEST"}`,
            },
          ]
        : [],
      ...content,
      subject: test ? `[Prueba] ${content.subject}` : content.subject,
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
    if (event.status !== "published") return;
    // No limit (it was just removed): everyone waiting gets in
    let free = event.capacity === null ? Number.POSITIVE_INFINITY : event.capacity - (yield* seatsTaken(event.id));
    if (free <= 0) return;
    const waiting = yield* query((db) =>
      db
        .select()
        .from(attendees)
        .where(and(eq(attendees.eventId, event.id), eq(attendees.status, "waitlisted")))
        .orderBy(asc(attendees.registeredAt), asc(attendees.id))
    );
    // Without a limit nobody needs to confirm: the seat is theirs
    const window = event.capacity === null ? 0 : offerWindowMs(event.startDate);
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
  // One rule with the card (rsvp-state): the team's close time, or the start; later comes in at the door
  if (event.endDate.getTime() <= Date.now() || signupClosesAt(event) <= Date.now()) {
    return new Conflict({ reason: "closed", message: "La inscripción ya cerró: si venís, pasá por la puerta" });
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
        // Only the hands this event asks for
        volunteerRoles: input.volunteerRoles.filter((role) => event.volunteerRoles.includes(role)),
        registeredAt: new Date(),
        offerExpiresAt: null,
        // A new sign-up starts clean: no "Voy" yet, nothing freed
        confirmedAt: null,
        cancelledAt: null,
        excusedAt: null,
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
      if (status === "attending" && !existing) yield* welcomeFirstTimer(row, event);
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return yield* toMine(row, event);
    })
  );

/**
 * Someone's first seat with a community: a "qué esperar" email (the agenda, how to get in, that
 * someone greets them). Optional mail, once per community and person.
 */
const welcomeFirstTimer = (row: AttendeeRow, event: EventContext) =>
  Effect.gen(function* () {
    if (!row.userId || !row.email) return;
    const [before] = yield* query((db) =>
      db
        .select({ id: attendees.id })
        .from(attendees)
        .innerJoin(events, eq(events.id, attendees.eventId))
        .where(
          and(
            eq(events.communityId, event.communityId),
            eq(attendees.userId, row.userId ?? ""),
            ne(events.id, event.id)
          )
        )
        .limit(1)
    );
    if (before) return;
    const optOut = yield* optionalMail(row.email);
    if (!optOut) return;
    const token = yield* Effect.promise(() => signLink("ticket", row.id));
    yield* enqueueEmail({
      kind: "rsvp_first_time",
      to: row.email,
      priority: 5,
      dedupeKey: `first_time:${event.communityId}:${row.userId}`,
      headers: optOut.headers,
      ...firstTimeEmail({
        name: row.name,
        community: event.community.name,
        event: event.name,
        when: shortWhen(event.startDate),
        place: placeFor(event, true),
        note: event.reminderNote,
        pageUrl: pageUrl(event),
        ticketUrl: ticketLink(event, token),
        unsubscribeUrl: optOut.url,
      }),
    });
  });

/** Give the seat (or the waitlist place) back; the next person in line gets it. */
const leaveRow = (attendeeId: string, eventId?: string) =>
  transaction(
    Effect.gen(function* () {
      const [peek] = yield* query((db) =>
        db.select({ eventId: attendees.eventId }).from(attendees).where(eq(attendees.id, attendeeId))
      );
      // A link for another event's ticket doesn't free anything here
      if (!peek || (eventId && peek.eventId !== eventId)) return yield* rsvpNotFound;
      const event = yield* contextOf(yield* lockEvent(peek.eventId));
      const [row] = yield* query((db) => db.select().from(attendees).where(eq(attendees.id, attendeeId)));
      if (!row) return yield* rsvpNotFound;
      if (!(ACTIVE as readonly string[]).includes(row.status)) return yield* toMine(row, event);
      if (row.checkedInAt) return yield* new Conflict({ reason: "checked_in", message: "Ya entraste al evento" });

      const hadSeat = (SEATED as readonly string[]).includes(row.status);
      const [left] = yield* query((db) =>
        db
          .update(attendees)
          // When they freed it: a late release (under 24 h) shows in their history, a no-show doesn't
          .set({ status: "cancelled", offerExpiresAt: null, cancelledAt: new Date() })
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
          // Taking the offer is saying "Voy"
          .set({ status: "attending", offerExpiresAt: null, confirmedAt: new Date() })
          .where(eq(attendees.id, row.id))
          .returning()
      );
      yield* notify(seated, event, "confirmed");
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return yield* toMine(seated, event);
    })
  );

/**
 * "Voy": someone with a seat says they're coming (the reminder's link, the ticket, the card).
 * Saying it twice changes nothing; after the start, or without a seat, there's nothing to confirm.
 */
const attendRow = (attendeeId: string, eventId?: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) => db.select().from(attendees).where(eq(attendees.id, attendeeId)));
    if (!row || (eventId && row.eventId !== eventId)) return yield* rsvpNotFound;
    const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, row.eventId)));
    if (!event) return yield* eventNotFound;
    const context = yield* contextOf(event);
    if (row.status !== "attending") {
      return yield* new Conflict({
        reason: "no_seat",
        message:
          row.status === "cancelled"
            ? "Ya liberaste tu lugar: si podés ir, anotate de nuevo"
            : "No tenés un lugar todavía",
      });
    }
    if (event.status !== "published" || event.startDate.getTime() <= Date.now()) {
      return yield* new Conflict({ reason: "closed", message: "El evento ya empezó: no hace falta confirmar" });
    }
    if (row.confirmedAt) return yield* toMine(row, context);
    const [confirmed] = yield* query((db) =>
      db
        .update(attendees)
        .set({ confirmedAt: new Date() })
        .where(and(eq(attendees.id, row.id), isNull(attendees.confirmedAt)))
        .returning()
    );
    yield* opsPing(event.id, "checkins");

    return yield* toMine(confirmed ?? row, context);
  });

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

/** "Voy" from the RSVP card, signed in. */
export const confirm = (eventId: string) =>
  Effect.gen(function* () {
    const row = yield* mineFor(eventId);
    if (!row) return yield* rsvpNotFound;

    return yield* attendRow(row.id);
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
    const [waiting] = yield* query((db) =>
      db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(attendees)
        .where(and(eq(attendees.eventId, event.id), eq(attendees.status, "waitlisted")))
    );

    return {
      rsvp: yield* toMine(row, context),
      name: row.name,
      token,
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        status: event.status,
        place: placeFor(context, row.status === "attending"),
        community: context.community,
        waiting: waiting?.count ?? 0,
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

/** "No puedo ir" from a signed link; with `eventId`, only for that event's ticket. */
export const leaveByToken = (token: string, eventId?: string) =>
  fromToken(token).pipe(Effect.flatMap((id) => leaveRow(id, eventId)));
export const confirmByToken = (token: string) => fromToken(token).pipe(Effect.flatMap(confirmRow));
/** "Voy" from the reminder's signed link (it lapses at the start), for that event only. */
export const confirmByLink = (token: string, eventId: string) =>
  fromToken(token).pipe(Effect.flatMap((id) => attendRow(id, eventId)));

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

/** The organizers approve or turn down someone waiting for review (not on a cancelled or finished event). */
export const review = (input: { eventId: string; attendeeId: string; decision: "approve" | "decline" }) =>
  transaction(
    Effect.gen(function* () {
      const event = yield* lockOrganized(input.eventId);
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
      if (status === "attending") yield* welcomeFirstTimer(reviewed, event);
      yield* recordActivity({
        eventId: event.id,
        verb: input.decision === "approve" ? "rsvp.approved" : "rsvp.declined",
        entityType: "attendee",
        entityId: row.id,
        // Never the person's name: editors read the log, and it outlives the sign-up
        summary: input.decision === "approve" ? "aprobó una inscripción" : "no aprobó una inscripción",
      });
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return yield* toMine(reviewed, event);
    })
  );

/**
 * Who waits for the team's approval, for anyone who reviews (editors included, without
 * attendee:read): name, what they answered (never the ID unless admin), their history here. No
 * emails, nothing to export.
 */
export const pending = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [event] = yield* query((db) =>
      db
        .select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
    );
    if (!event) return yield* eventNotFound;
    const rows = yield* query((db) =>
      db
        .select()
        .from(attendees)
        .where(and(eq(attendees.eventId, eventId), eq(attendees.status, "pending")))
        .orderBy(asc(attendees.registeredAt), asc(attendees.id))
        .limit(500)
    );
    const sensitive = yield* seesSensitive(communityId);
    const history = yield* historyOf(
      communityId,
      rows.flatMap((row) => (row.userId ? [row.userId] : [])),
      event.startDate
    );

    return rows.map((row): Pending => ({
      id: row.id,
      name: row.name,
      guests: row.guests,
      registeredAt: row.registeredAt?.toISOString() ?? null,
      answers: labelled(event.questions, row.answers, sensitive),
      history: row.userId ? (history.get(row.userId) ?? null) : null,
    }));
  });

/** The scoped community's event, locked like every path that changes who has a seat. */
const lockOrganized = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const event = yield* contextOf(yield* lockEvent(eventId));
    if (event.communityId !== communityId) return yield* eventNotFound;
    // A cancelled or finished event keeps its list as it was: no seats, no emails, no invites
    if (event.status !== "published" || event.endDate.getTime() <= Date.now()) {
      return yield* new Conflict({
        reason: "closed",
        message: "El evento ya no está abierto: su lista queda como está",
      });
    }

    return event;
  });

/**
 * The organizers give someone waiting their seat now: an offered seat becomes theirs, someone on
 * the waitlist gets one if it fits (more room is a bigger cupo in Ajustes, never an overbooked room).
 */
export const giveSeat = (input: { eventId: string; attendeeId: string }) =>
  transaction(
    Effect.gen(function* () {
      const event = yield* lockOrganized(input.eventId);
      const [row] = yield* query((db) =>
        db
          .select()
          .from(attendees)
          .where(and(eq(attendees.id, input.attendeeId), eq(attendees.eventId, event.id)))
      );
      if (!row) return yield* rsvpNotFound;
      if (row.status !== "waitlisted" && row.status !== "offered") {
        return yield* new Conflict({ reason: "not_waiting", message: "Esa persona no está esperando un lugar" });
      }
      if (
        row.status === "waitlisted" &&
        event.capacity !== null &&
        (yield* seatsTaken(event.id)) + 1 + row.guests > event.capacity
      ) {
        return yield* new Conflict({
          reason: "full",
          message: "No queda lugar: subí el cupo en Ajustes para darle uno",
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
      yield* recordActivity({
        eventId: event.id,
        verb: "rsvp.seated",
        entityType: "attendee",
        entityId: row.id,
        summary: "le dio un lugar a alguien que esperaba",
      });
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return yield* toMine(seated, event);
    })
  );

/**
 * The organizers take people's places (a duplicate, someone who said so by other means): each
 * one hears about it, and the freed seats go to the next in line. Who already came in stays.
 */
export const cancelSpots = (input: { eventId: string; attendeeIds: string[] }) =>
  transaction(
    Effect.gen(function* () {
      const event = yield* lockOrganized(input.eventId);
      const rows = yield* query((db) =>
        db
          .select()
          .from(attendees)
          .where(
            and(
              eq(attendees.eventId, event.id),
              eq(attendees.source, "owu"),
              inArray(attendees.id, input.attendeeIds),
              inArray(attendees.status, [...ACTIVE]),
              isNull(attendees.checkedInAt)
            )
          )
      );
      if (rows.length === 0) return { cancelled: 0 };
      const now = new Date();
      yield* query((db) =>
        db
          .update(attendees)
          // The team's call (a duplicate, someone who told them): never a no-show or a late release
          .set({ status: "cancelled", offerExpiresAt: null, cancelledAt: now, excusedAt: now })
          .where(
            inArray(
              attendees.id,
              rows.map((row) => row.id)
            )
          )
      );
      for (const row of rows) {
        // As it was: the email takes the invite back only from someone who had the seat
        yield* notify(row, event, "removed");
        yield* recordActivity({
          eventId: event.id,
          verb: "rsvp.cancelled",
          entityType: "attendee",
          entityId: row.id,
          summary: "canceló el lugar de una persona",
        });
      }
      yield* promote(event);
      yield* opsPing(event.id, "checkins");
      refreshPage(eventPagePath(event.community.slug, event.slug));

      return { cancelled: rows.length };
    })
  );

/** What the cadence sends on its own, in order: an organizer's test gets one of each. */
const CADENCE: RsvpEmailKind[] = ["confirmed", "reminder_48h", "confirm_ping", "reminder_2h", "feedback"];

/**
 * Every email of the cadence to the organizer asking, as their people would get it now (the
 * reminders' note included), marked [Prueba]. Once a minute at most.
 */
export const sendTest = (eventId: string) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const { communityId } = yield* CommunityScope;
    const [row] = yield* query((db) =>
      db
        .select()
        .from(events)
        .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
    );
    if (!row) return yield* eventNotFound;
    const event = yield* contextOf(row);
    const [account] = yield* query((db) =>
      db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, me.id))
    );
    if (!account) return yield* rsvpNotFound;
    const minute = Math.floor(Date.now() / 60_000);
    const sample = {
      id: `prueba-${me.id}`,
      eventId,
      name: account.name,
      email: account.email,
      status: "attending",
      guests: 0,
      registeredAt: new Date(),
      offerExpiresAt: null,
    } as AttendeeRow;
    const kinds = CADENCE.filter((kind) => kind !== "confirm_ping" || pings(event));
    for (const kind of kinds) {
      yield* notify(sample, event, kind, { dedupeKey: `test_${kind}:${eventId}:${me.id}:${minute}`, test: true });
    }

    return { sent: kinds.length, to: account.email };
  });

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
    const kind = hours <= 2 ? ("reminder_2h" as const) : settled(attendee, now) ? ("reminder_48h" as const) : null;

    return kind ? [{ attendee, event, kind, key: `${kind}:${attendee.id}:${event.startDate.getTime()}` }] : [];
  });

  return { reminders: yield* sendDue(due) };
});

/** Signed up more than 12 hours before: a fresh sign-up isn't asked "¿seguís yendo?" */
const settled = (attendee: AttendeeRow, now: number) =>
  attendee.registeredAt !== null && now - attendee.registeredAt.getTime() > 12 * HOUR_MS;

/** The event asks its unconfirmed people again 24 h before: it's on, and a seat is worth freeing. */
const pings = (event: EventRow) => event.confirmPing && (event.waitlist || event.capacity !== null);

/**
 * A day before, a second "¿Seguís viniendo?" only to people with a seat who haven't said "Voy",
 * when the event has a waitlist or a limit (and the team didn't turn it off). Once per date.
 */
export const sendConfirmPings = Effect.gen(function* () {
  const now = Date.now();
  const rows = yield* seatedAt(
    and(
      gt(events.startDate, new Date(now + 2 * HOUR_MS)),
      lt(events.startDate, new Date(now + 24 * HOUR_MS)),
      eq(events.confirmPing, true),
      or(eq(events.waitlist, true), isNotNull(events.capacity)),
      isNull(attendees.confirmedAt),
      isNull(attendees.checkedInAt)
    )
  );
  const due = rows
    .filter(({ attendee, event }) => pings(event) && settled(attendee, now))
    .map(({ attendee, event }) => ({
      attendee,
      event,
      kind: "confirm_ping" as const,
      key: `confirm_ping:${attendee.id}:${event.startDate.getTime()}`,
    }));

  return { pings: yield* sendDue(due) };
});

/**
 * Up to three other published OWU events in the next 7 days (any community), soonest first: the
 * reminders' footer. Read once per sweep.
 */
const upcomingThisWeek = (now: number) =>
  query((db) =>
    db
      .select({
        id: events.id,
        name: events.name,
        slug: events.slug,
        startDate: events.startDate,
        community: communities,
      })
      .from(events)
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(
        and(
          eq(events.status, "published"),
          eq(events.isActive, true),
          eq(communities.isActive, true),
          gt(events.startDate, new Date(now)),
          lt(events.startDate, new Date(now + 7 * 24 * HOUR_MS))
        )
      )
      .orderBy(asc(events.startDate))
      .limit(12)
  );

/** Send the reminders that are due (skipping what's already queued), each event read once. */
const sendDue = (due: { attendee: AttendeeRow; event: EventRow; kind: RsvpEmailKind; key: string }[]) =>
  Effect.gen(function* () {
    const done = yield* queued(due.map((item) => item.key));
    const todo = due.filter((entry) => !done.has(entry.key));
    if (todo.length === 0) return 0;
    const soon = yield* upcomingThisWeek(Date.now());
    const contexts = new Map<string, { context: EventContext; waiting: number; others: OtherEvent[] }>();
    for (const item of todo) {
      let found = contexts.get(item.event.id);
      if (!found) {
        const [waiting] = yield* query((db) =>
          db
            .select({ count: sql<number>`count(*)`.mapWith(Number) })
            .from(attendees)
            .where(and(eq(attendees.eventId, item.event.id), eq(attendees.status, "waitlisted")))
        );
        found = {
          context: yield* contextOf(item.event),
          waiting: waiting?.count ?? 0,
          others: soon
            .filter((other) => other.id !== item.event.id)
            .slice(0, 3)
            .map((other) => ({
              name: other.name,
              community: other.community.name,
              when: shortWhen(other.startDate),
              url: appUrl(eventPagePath(other.community.slug, other.slug)),
            })),
        };
        contexts.set(item.event.id, found);
      }
      yield* notify(item.attendee, found.context, item.kind, {
        dedupeKey: item.key,
        waiting: found.waiting,
        others: found.others,
      });
    }

    return todo.length;
  });

/**
 * Between 2 and 26 hours after it ends, the event's open survey goes to the people who came when
 * the door was used (someone checked in), or to everyone with a seat when it wasn't.
 */
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
          ne(attendees.email, ""),
          eq(events.status, "published"),
          lt(events.endDate, new Date(now - 2 * HOUR_MS)),
          gt(events.endDate, new Date(now - 26 * HOUR_MS)),
          or(isNotNull(attendees.checkedInAt), sql`not ${doorUsedAt}`)
        )
      )
  );
  const done = yield* queued(rows.map(({ attendee }) => `feedback:${attendee.id}`));
  const contexts = new Map<string, EventContext>();
  let sent = 0;
  for (const { attendee, event } of rows.filter((row) => !done.has(`feedback:${row.attendee.id}`))) {
    const context = contexts.get(event.id) ?? (yield* contextOf(event));
    contexts.set(event.id, context);
    yield* notify(attendee, context, "feedback", { dedupeKey: `feedback:${attendee.id}` });
    sent += 1;
  }

  return { feedback: sent };
});

/**
 * For communities that turned it on (off by default): one friendly note to someone after their
 * second silent no-show there ("la próxima, si no podés, liberá tu lugar"). Looks at events that
 * ended 2 h to 3 days ago, so a no-show is fresh; once per community and person.
 */
export const sendNoShowNudges = Effect.gen(function* () {
  const now = Date.now();
  const missed = yield* query((db) =>
    db
      .select({
        userId: attendees.userId,
        email: attendees.email,
        name: attendees.name,
        communityId: communities.id,
        community: communities.name,
        slug: communities.slug,
      })
      .from(attendees)
      .innerJoin(events, eq(events.id, attendees.eventId))
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(
        and(
          eq(communities.noShowNudge, true),
          eq(events.status, "published"),
          lt(events.endDate, new Date(now - 2 * HOUR_MS)),
          gt(events.endDate, new Date(now - 72 * HOUR_MS)),
          eq(attendees.source, "owu"),
          eq(attendees.status, "attending"),
          isNull(attendees.checkedInAt),
          isNull(attendees.excusedAt),
          isNotNull(attendees.userId),
          ne(attendees.email, ""),
          doorUsedAt
        )
      )
  );
  const key = (row: (typeof missed)[number]) => `noshow_nudge:${row.communityId}:${row.userId}`;
  const done = yield* queued(missed.map(key));
  let sent = 0;
  for (const [communityId, people] of Map.groupBy(
    missed.filter((row) => !done.has(key(row))),
    (row) => row.communityId
  )) {
    const history = yield* historyOf(
      communityId,
      people.map((row) => row.userId ?? ""),
      new Date(now)
    );
    for (const person of people) {
      if ((history.get(person.userId ?? "")?.noShows ?? 0) < NUDGE_AFTER_NO_SHOWS) continue;
      const optOut = yield* optionalMail(person.email);
      if (!optOut) continue;
      yield* enqueueEmail({
        kind: "rsvp_noshow_nudge",
        to: person.email,
        priority: 6,
        dedupeKey: key(person),
        headers: optOut.headers,
        ...noShowNudgeEmail({
          name: person.name,
          community: person.community,
          profileUrl: appUrl(`/comunidad/${person.slug}`),
          unsubscribeUrl: optOut.url,
        }),
      });
      sent += 1;
    }
  }

  return { nudges: sent };
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
          yield* notify(person, event, "updated", { dedupeKey: `event_updated:${person.id}:${event.icsSequence}` });
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
    for (const person of people) {
      yield* notify(person, event, "event_cancelled", { dedupeKey: `event_cancelled:${person.id}` });
    }
    yield* query((db) =>
      db
        .update(events)
        .set({ notifiedSequence: event.icsSequence, updatedAt: event.updatedAt })
        .where(eq(events.id, eventId))
    );

    return people.length;
  });

/**
 * Before an account is deleted: a seat or place it holds in an upcoming event is given back (the
 * next in line gets it), and every sign-up keeps counting but no longer says who it was.
 */
export const forget = (userId: string) =>
  Effect.gen(function* () {
    const held = yield* query((db) =>
      db
        .select({ id: attendees.id })
        .from(attendees)
        .innerJoin(events, eq(events.id, attendees.eventId))
        .where(and(eq(attendees.userId, userId), inArray(attendees.status, ACTIVE), gt(events.startDate, new Date())))
    );
    // A checked-in person can't leave; their row is still anonymized below
    for (const row of held) yield* leaveRow(row.id).pipe(Effect.ignore);
    yield* query((db) =>
      db
        .update(attendees)
        .set({ name: "Anónimo", email: "", answers: {}, showName: false, barcode: null })
        .where(eq(attendees.userId, userId))
    );
  });
