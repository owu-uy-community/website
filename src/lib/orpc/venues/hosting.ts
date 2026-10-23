import { and, asc, eq, gt, isNull, lte, ne, sql } from "drizzle-orm";
import { Effect } from "effect";

import { clockTime, shortWhen } from "../../community/time";
import {
  attendees,
  communities,
  emailDeliveries,
  events,
  surveyResponses,
  surveys,
  user,
  venueContacts,
  venueRequests,
  venues,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl } from "../../email/templates";
import { venueCheckEmail, venueDaySheetEmail, venueIdListEmail, venueRecapEmail } from "../../email/venue-templates";
import { readLink, signLink } from "../../links";
import { CHECK_EVERY_DAYS, isStale } from "../../organizar/venue-contacts";
import { DEFAULT_ID_DEADLINE_HOURS, type VenueFactsInput } from "../../organizar/venue-facts";
import { SIZE_PEOPLE } from "../../organizar/venue-fit";
import { expectedTurnout } from "../../organizar/turnout";
import { query, transaction } from "../db";
import { Conflict, NotFound } from "../errors";
import * as Events from "../events/service";
import { recordActivity } from "../ops";
import { CommunityScope } from "../services";
import { AMENITY_SHORT, type Amenity, type CheckView, type Recap } from "./schemas";
import { activeContactsOf } from "./service";

/**
 * What keeps a space coming back: the sheet a week before, the ID list the building asks for, the
 * recap after (numbers only, reviewed and sent by the organizer) and the yearly "¿seguís?" that
 * keeps its contact true.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** The host-day sheet goes this long before the event */
export const DAY_SHEET_DAYS = 7;
/** The team arrives this long before the start to set up */
export const ARRIVE_BEFORE_MIN = 45;
/** Food comes for the networking after the talks: 30′ networking + ~60′ talks (plan §2.3) */
export const FOOD_AFTER_START_MIN = 90;
/** A survey text question written for the host: its answers may go in the recap */
export const HOST_COMMENT_QUESTION_ID = "para-el-espacio";
const HOST_QUESTION = /espacio|anfitri/i;

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

/** One person across events: their account, else their email (Eventbrite mirrors have no account). */
const personKey = (row: { userId: string | null; email: string; id: string }) =>
  row.userId ?? (row.email ? row.email.toLowerCase() : row.id);

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * The host's recap for a past event at a directory space: who came (the door's count, else the
 * seats), the share of first-timers (nobody with a seat at an earlier event of this community),
 * the survey's average and up to three answers written for the host, the materials. Never a name.
 */
export const recapOf = (eventId: string, communityId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({ event: events, venue: venues, community: communities.name })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
    );
    if (!row) return yield* eventNotFound;
    const { event, venue } = row;
    if (!venue) {
      return yield* new Conflict({
        reason: "no_venue",
        message: "Este evento no se hizo en un espacio del directorio",
      });
    }
    if (event.endDate.getTime() > Date.now()) {
      return yield* new Conflict({ reason: "not_over", message: "El resumen se manda cuando termina el evento" });
    }

    const people = yield* query((db) =>
      db
        .select({
          id: attendees.id,
          userId: attendees.userId,
          email: attendees.email,
          status: attendees.status,
          guests: attendees.guests,
          checkedInAt: attendees.checkedInAt,
        })
        .from(attendees)
        .where(eq(attendees.eventId, eventId))
    );
    const fromDoor = people.some((person) => person.checkedInAt !== null);
    const came = fromDoor
      ? people.filter((person) => person.checkedInAt !== null)
      : people.filter((person) => person.status === "attending");
    const earlier = yield* query((db) =>
      db
        .select({ id: attendees.id, userId: attendees.userId, email: attendees.email })
        .from(attendees)
        .innerJoin(events, eq(events.id, attendees.eventId))
        .where(
          and(
            eq(events.communityId, communityId),
            eq(events.status, "published"),
            ne(events.id, eventId),
            sql`${events.startDate} < ${event.startDate}`,
            eq(attendees.status, "attending")
          )
        )
    );
    const before = new Set(earlier.map(personKey));
    const firsts = came.filter((person) => !before.has(personKey(person))).length;

    const [survey] = yield* query((db) => db.select().from(surveys).where(eq(surveys.eventId, eventId)));
    const answers = survey
      ? yield* query((db) =>
          db
            .select({ answers: surveyResponses.answers, createdAt: surveyResponses.createdAt })
            .from(surveyResponses)
            .where(eq(surveyResponses.surveyId, survey.id))
            .orderBy(asc(surveyResponses.createdAt))
        )
      : [];
    const questions = survey?.questions ?? [];
    // One score per response (its ratings' average, of 5); NPS (of 10) only when there are no ratings
    const scored = (kind: "rating" | "nps") =>
      answers.flatMap((response) => {
        const mine = questions
          .filter((question) => question.kind === kind)
          .map((question) => response.answers[question.id])
          .filter((value): value is number => typeof value === "number")
          .map((value) => (kind === "nps" ? value / 2 : value));

        return mine.length > 0 ? [mine.reduce((sum, value) => sum + value, 0) / mine.length] : [];
      });
    const values = scored("rating").length > 0 ? scored("rating") : scored("nps");
    const forHost = questions.filter(
      (question) =>
        question.kind === "text" && (question.id === HOST_COMMENT_QUESTION_ID || HOST_QUESTION.test(question.label))
    );
    const comments = answers
      .toReversed()
      .flatMap((response) => forHost.map((question) => response.answers[question.id]))
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, 3);

    return {
      eventId,
      eventName: event.name,
      venueName: venue.name,
      community: row.community,
      when: shortWhen(event.startDate, event.timezone),
      came: fromDoor ? came.length : came.reduce((sum, person) => sum + 1 + person.guests, 0),
      fromDoor,
      firstTimers: came.length > 0 ? firsts / came.length : null,
      rating:
        values.length > 0
          ? { average: round1(values.reduce((sum, value) => sum + value, 0) / values.length), answers: values.length }
          : null,
      comments,
      materials: event.materials.map((material) => ({ title: material.title, url: material.url })),
      recipients: (yield* activeContactsOf(venue.id)).length,
      sentAt: event.hostRecapSentAt?.toISOString() ?? null,
    } satisfies Recap;
  });

/** What the host would get, for the organizer to review. */
export const recapPreview = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;

    return yield* recapOf(eventId, communityId);
  });

/** Send the recap (with the organizer's note) to the space's contacts, once: a second send is a no-op. */
export const sendRecap = (input: { eventId: string; note: string }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const [locked] = yield* query((db) =>
        db
          .select({ id: events.id, venueId: events.venueId, updatedAt: events.updatedAt })
          .from(events)
          .where(and(eq(events.id, input.eventId), eq(events.communityId, communityId)))
          .for("update")
      );
      if (!locked) return yield* eventNotFound;
      const recap = yield* recapOf(input.eventId, communityId);
      if (recap.sentAt) return recap;
      const contacts = yield* activeContactsOf(locked.venueId ?? "");
      if (contacts.length === 0) {
        return yield* new Conflict({
          reason: "no_contact",
          message: "El espacio no tiene a quién mandárselo: avisale al staff de OWU",
        });
      }

      for (const contact of contacts) {
        yield* enqueueEmail({
          kind: "venue_recap",
          to: contact.email,
          dedupeKey: `venue_recap:${input.eventId}:${contact.email}`,
          ...venueRecapEmail({
            venue: recap.venueName,
            community: recap.community,
            event: recap.eventName,
            when: recap.when,
            came: recap.came,
            fromDoor: recap.fromDoor,
            firstTimers: recap.firstTimers,
            rating: recap.rating,
            comments: recap.comments,
            materials: recap.materials,
            note: input.note,
          }),
        });
      }
      const sentAt = new Date();
      // Keep updatedAt: someone editing the event right now must not read this as another person's save
      yield* query((db) =>
        db
          .update(events)
          .set({ hostRecapSentAt: sentAt, updatedAt: locked.updatedAt })
          .where(eq(events.id, input.eventId))
      );
      yield* recordActivity({
        eventId: input.eventId,
        verb: "venue.recap",
        entityType: "event",
        entityId: input.eventId,
        summary: `le mandó el resumen a ${recap.venueName}`,
      });

      return { ...recap, sentAt: sentAt.toISOString() };
    })
  );

/** How many to tell the host: the likely turnout once people sign up, else what was asked, else the room. */
const expectedPeople = (event: typeof events.$inferSelect) =>
  Effect.gen(function* () {
    const [seats] = yield* query((db) =>
      db
        .select({
          attending: sql<number>`count(*)`.mapWith(Number),
          guests: sql<number>`coalesce(sum(${attendees.guests}), 0)`.mapWith(Number),
          confirmed: sql<number>`count(*) filter (where ${attendees.confirmedAt} is not null)`.mapWith(Number),
        })
        .from(attendees)
        .where(and(eq(attendees.eventId, event.id), eq(attendees.status, "attending")))
    );
    if (seats && seats.attending > 0) {
      const { rate } = yield* Events.showUp.pipe(
        Effect.provideService(CommunityScope, { communityId: event.communityId })
      );
      return expectedTurnout({ ...seats, showRate: rate }).likely;
    }
    const [asked] = yield* query((db) =>
      db
        .select({ expected: venueRequests.expectedAttendees })
        .from(venueRequests)
        .where(and(eq(venueRequests.eventId, event.id), eq(venueRequests.status, "accepted")))
    );

    return asked?.expected ?? event.capacity ?? (event.sizeBucket ? SIZE_PEOPLE[event.sizeBucket] : 0);
  });

/**
 * A week before an event at a directory space, its contacts get the day's sheet (arrival, people,
 * AV needs, food, the security list's deadline); when the building asks for IDs, at the deadline
 * they get the list: names and the answers to the event's CI question, of the people with a seat,
 * only if the event asked it. Each once per event and date.
 */
export const sendHostDaySheets = Effect.gen(function* () {
  const now = Date.now();
  const upcoming = yield* query((db) =>
    db
      .select({ event: events, venue: venues, community: communities.name })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(
        and(
          eq(events.status, "published"),
          gt(events.startDate, new Date(now)),
          lte(events.startDate, new Date(now + DAY_SHEET_DAYS * DAY_MS))
        )
      )
  );
  let sheets = 0;
  let lists = 0;
  for (const { event, venue, community } of upcoming) {
    const contacts = yield* activeContactsOf(venue.id);
    if (contacts.length === 0) continue;
    const start = event.startDate.getTime();
    const facts: VenueFactsInput = venue.facts;
    const deadline = start - (facts.idDeadlineHours ?? DEFAULT_ID_DEADLINE_HOURS) * HOUR_MS;
    const [organizer] = yield* query((db) =>
      db
        .select({ name: user.name, email: user.email })
        .from(venueRequests)
        .innerJoin(user, eq(user.id, venueRequests.requestedById))
        .where(
          and(
            eq(venueRequests.eventId, event.id),
            eq(venueRequests.venueId, venue.id),
            eq(venueRequests.status, "accepted")
          )
        )
    );
    const expected = yield* expectedPeople(event);
    for (const contact of contacts) {
      yield* enqueueEmail({
        kind: "venue_day_sheet",
        to: contact.email,
        dedupeKey: `venue_day_sheet:${event.id}:${start}:${contact.email}`,
        ...venueDaySheetEmail({
          venue: venue.name,
          community,
          event: event.name,
          when: shortWhen(event.startDate, event.timezone),
          arrival: clockTime(new Date(start - ARRIVE_BEFORE_MIN * 60_000), event.timezone),
          expected,
          needs: event.needs.map((need) => AMENITY_SHORT[need as Amenity] ?? need),
          food: event.needs.includes("comida")
            ? `llega cerca de las ${clockTime(new Date(start + FOOD_AFTER_START_MIN * 60_000), event.timezone)}`
            : null,
          idListBy: facts.idRequired ? shortWhen(new Date(deadline), event.timezone) : null,
          organizer: organizer ?? null,
        }),
      });
    }
    sheets += 1;

    const ci = event.questions.find((question) => question.preset === "ci");
    if (!facts.idRequired || !ci || now < deadline) continue;
    const seated = yield* query((db) =>
      db
        .select({ name: attendees.name, answers: attendees.answers })
        .from(attendees)
        .where(and(eq(attendees.eventId, event.id), eq(attendees.status, "attending")))
        .orderBy(asc(attendees.name))
    );
    for (const contact of contacts) {
      yield* enqueueEmail({
        kind: "venue_id_list",
        to: contact.email,
        priority: 2,
        dedupeKey: `venue_id_list:${event.id}:${start}:${contact.email}`,
        ...venueIdListEmail({
          venue: venue.name,
          community,
          event: event.name,
          when: shortWhen(event.startDate, event.timezone),
          people: seated.map((person) => ({ name: person.name, id: person.answers[ci.id]?.trim() || "—" })),
        }),
      });
    }
    lists += 1;
  }

  return { sheets, lists };
});

/**
 * Once a year at most per contact, those not confirmed in 6 months (see isStale) get "¿Siguen
 * pudiendo recibir meetups?" with a link to answer in one tap. Runs with the daily cron.
 */
export const sendYearlyChecks = Effect.gen(function* () {
  const now = Date.now();
  const rows = yield* query((db) =>
    db
      .select({ contact: venueContacts, venue: venues.name })
      .from(venueContacts)
      .innerJoin(venues, eq(venues.id, venueContacts.venueId))
      .where(and(eq(venues.status, "active"), isNull(venueContacts.leftAt), isNull(venueContacts.bouncedAt)))
  );
  const due = rows.filter((row) => isStale(row.contact, now));
  if (due.length === 0) return { asked: 0 };
  const recent = yield* query((db) =>
    db
      .select({ dedupeKey: emailDeliveries.dedupeKey })
      .from(emailDeliveries)
      .where(
        and(
          eq(emailDeliveries.kind, "venue_check"),
          gt(emailDeliveries.createdAt, new Date(now - CHECK_EVERY_DAYS * DAY_MS))
        )
      )
  );
  const asked = new Set(recent.map((row) => row.dedupeKey.split(":")[1]));
  const year = Math.floor(now / (CHECK_EVERY_DAYS * DAY_MS));
  let sent = 0;
  for (const { contact, venue } of due) {
    if (asked.has(contact.id)) continue;
    const token = yield* Effect.promise(() => signLink("venue-check", contact.id, new Date(now + 60 * DAY_MS)));
    yield* enqueueEmail({
      kind: "venue_check",
      to: contact.email,
      dedupeKey: `venue_check:${contact.id}:${year}`,
      ...venueCheckEmail({ name: contact.name, venue, link: appUrl(`/espacios/seguimos/${token}`) }),
    });
    sent += 1;
  }

  return { asked: sent };
});

const checkNotFound = new NotFound({
  entity: "venue_contact",
  message: "Este link venció o no es válido: escribinos a OWU y te mandamos otro",
});

const contactFromCheck = (token: string) =>
  Effect.gen(function* () {
    const id = yield* Effect.promise(() => readLink("venue-check", token));
    if (!id) return yield* checkNotFound;
    const [row] = yield* query((db) =>
      db
        .select({ contact: venueContacts, venue: venues })
        .from(venueContacts)
        .innerJoin(venues, eq(venues.id, venueContacts.venueId))
        .where(eq(venueContacts.id, id))
    );
    if (!row) return yield* checkNotFound;

    return row;
  });

/** The yearly check's page. Reading it never changes anything: the answer is a POST. */
export const checkByToken = (token: string) =>
  contactFromCheck(token).pipe(
    Effect.map(({ contact, venue }): CheckView => ({
      venueName: venue.name,
      contactName: contact.name.split(" ")[0] ?? "",
      requestable: venue.requestable,
      facts: venue.facts,
      left: contact.leftAt !== null,
    }))
  );

/**
 * The contact's answer: yes (confirmed, and the space takes requests again), not for now (requests
 * paused) or "ya no trabajo ahí" (gone; with nobody else, the space stops taking requests). With
 * any of them, the space's facts as they corrected them.
 */
export const checkAnswer = (input: { token: string; answer: "yes" | "pause" | "left"; facts?: VenueFactsInput }) =>
  transaction(
    Effect.gen(function* () {
      const { contact, venue } = yield* contactFromCheck(input.token);
      const now = new Date();
      yield* query((db) =>
        db
          .update(venueContacts)
          .set(input.answer === "left" ? { leftAt: now } : { lastConfirmedAt: now, bouncedAt: null, leftAt: null })
          .where(eq(venueContacts.id, contact.id))
      );
      const others = yield* query((db) =>
        db
          .select({ id: venueContacts.id })
          .from(venueContacts)
          .where(
            and(
              eq(venueContacts.venueId, venue.id),
              ne(venueContacts.id, contact.id),
              isNull(venueContacts.leftAt),
              isNull(venueContacts.bouncedAt)
            )
          )
      );
      const requestable =
        input.answer === "yes"
          ? venue.status === "active"
          : input.answer === "pause"
            ? false
            : venue.requestable && others.length > 0;
      yield* query((db) =>
        db
          .update(venues)
          .set({
            requestable,
            ...(input.facts && input.answer !== "left" ? { facts: { ...venue.facts, ...input.facts } } : {}),
          })
          .where(eq(venues.id, venue.id))
      );
      yield* recordActivity({
        eventId: null,
        verb: "venue.checked",
        entityType: "venue",
        entityId: venue.id,
        actorId: contact.userId ?? undefined,
        summary:
          input.answer === "yes"
            ? `${venue.name} sigue recibiendo meetups`
            : input.answer === "pause"
              ? `${venue.name} pausó los pedidos`
              : `un contacto de ${venue.name} ya no está`,
      });

      return { answer: input.answer, requestable };
    })
  );
