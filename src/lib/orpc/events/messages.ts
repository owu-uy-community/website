import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import { attendees, communities, eventMessages, events, user, type EventMessageAudience } from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { appUrl, eventMessageEmail } from "../../email/templates";
import { eventPagePath } from "../../revalidate";
import { shortWhen } from "../../community/time";
import { doorUsedAt } from "../attendees/history";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { recordActivity } from "../ops";
import { optionalMail } from "../rsvps/service";
import { CommunityScope, CurrentUser } from "../services";
import type { Audience, EventMessage } from "./schemas";

/**
 * The team writing to an event's people: now, at a set time (the tick sends it), or to themselves
 * as a test. Every message is kept in `event_messages`, the Emails tab's log.
 */

const notFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

/** Who each audience is, among the event's attendees (the query joins `events` for the door rule). */
const AUDIENCE: Record<Audience, SQL> = {
  attending: eq(attendees.status, "attending"),
  waiting: inArray(attendees.status, ["waitlisted", "offered"]),
  pending: eq(attendees.status, "pending"),
  came: isNotNull(attendees.checkedInAt),
  // "No vinieron" only means something once the door was used
  missed: and(eq(attendees.status, "attending"), isNull(attendees.checkedInAt), doorUsedAt) as SQL,
  // The waitlist that never got a seat (the event is over by the time this is written)
  "waitlist-left": inArray(attendees.status, ["waitlisted", "offered"]),
};

/** The log names the waitlist as the schema does */
const STORED: Record<Audience, EventMessageAudience> = {
  attending: "attending",
  waiting: "waitlisted",
  pending: "pending",
  came: "came",
  missed: "missed",
  "waitlist-left": "waitlist-left",
};
const fromStored = (audience: string): Audience => (audience === "waitlisted" ? "waiting" : (audience as Audience));

type Target = { id: string; name: string; slug: string; status: string; communitySlug: string; community: string };

const targetOf = (eventId: string, communityId: string) =>
  query((db) =>
    db
      .select({
        id: events.id,
        name: events.name,
        slug: events.slug,
        status: events.status,
        communitySlug: communities.slug,
        community: communities.name,
      })
      .from(events)
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(and(eq(events.id, eventId), eq(events.communityId, communityId)))
  ).pipe(Effect.flatMap(([event]) => (event ? Effect.succeed(event satisfies Target) : Effect.fail(notFound))));

const fingerprint = (subject: string, body: string) =>
  createHash("sha256").update(`${subject}\n${body}`).digest("hex").slice(0, 16);

/**
 * Queue the message for everyone in the audiences (or only `ids` within them) who has an address
 * and didn't turn these emails off. `key` + the attendee makes each send once.
 */
const deliver = (
  event: Target,
  message: { audiences: Audience[]; ids?: string[]; subject: string; body: string; key: string }
) =>
  Effect.gen(function* () {
    const people = yield* query((db) =>
      db
        .select({ id: attendees.id, email: attendees.email })
        .from(attendees)
        .innerJoin(events, eq(events.id, attendees.eventId))
        .where(
          and(
            eq(attendees.eventId, event.id),
            or(...message.audiences.map((audience) => AUDIENCE[audience])),
            message.ids ? inArray(attendees.id, message.ids) : undefined
          )
        )
    );
    let sent = 0;
    for (const person of people.filter((row) => row.email)) {
      // Whoever turned off reminders doesn't get these either; the rest can, in one click
      const optOut = yield* optionalMail(person.email);
      if (!optOut) continue;
      yield* enqueueEmail({
        kind: "event_message",
        to: person.email,
        dedupeKey: `${message.key}:${person.id}`,
        headers: optOut.headers,
        ...eventMessageEmail({
          community: event.community,
          event: event.name,
          subject: message.subject,
          body: message.body,
          pageUrl: appUrl(eventPagePath(event.communitySlug, event.slug)),
          unsubscribeUrl: optOut.url,
        }),
      });
      sent += 1;
    }

    return sent;
  });

/** Write to the event's people now. Each gets it once, whoever clicks twice; the log keeps it. */
export const message = (input: { eventId: string; to: Audience[]; ids?: string[]; subject: string; body: string }) =>
  transaction(
    Effect.gen(function* () {
      const { communityId } = yield* CommunityScope;
      const me = yield* CurrentUser;
      const event = yield* targetOf(input.eventId, communityId);
      const sent = yield* deliver(event, {
        audiences: input.to,
        ids: input.ids,
        subject: input.subject,
        body: input.body,
        key: `event_message:${event.id}:${fingerprint(input.subject, input.body)}`,
      });
      const now = new Date();
      yield* query((db) =>
        db.insert(eventMessages).values({
          eventId: event.id,
          audience: STORED[input.to[0] ?? "attending"],
          subject: input.subject,
          body: input.body,
          sendAt: now,
          status: "sent",
          recipients: sent,
          createdById: me.id,
          sentAt: now,
        })
      );
      yield* recordActivity({
        eventId: event.id,
        verb: "event.messaged",
        entityType: "event",
        entityId: event.id,
        summary: `escribió a ${sent} ${sent === 1 ? "persona" : "personas"}: «${input.subject}»`,
      });

      return { sent };
    })
  );

const toMessage = (row: typeof eventMessages.$inferSelect, by: string | null): EventMessage => ({
  id: row.id,
  audience: fromStored(row.audience),
  subject: row.subject,
  body: row.body,
  status: row.status,
  sendAt: row.sendAt.toISOString(),
  sentAt: row.sentAt?.toISOString() ?? null,
  recipients: row.recipients,
  by,
});

const MAX_AHEAD_MS = 90 * 86_400_000;

/** Send it later by itself: the tick sends what's due through the outbox. */
export const schedule = (input: { eventId: string; to: Audience; subject: string; body: string; sendAt: string }) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const me = yield* CurrentUser;
    const event = yield* targetOf(input.eventId, communityId);
    if (event.status === "cancelled") {
      return yield* new Conflict({
        reason: "cancelled",
        message: "El evento está cancelado: no se programan mensajes",
      });
    }
    const sendAt = new Date(input.sendAt);
    if (sendAt.getTime() < Date.now() + 60_000 || sendAt.getTime() > Date.now() + MAX_AHEAD_MS) {
      return yield* new Invalid({ message: "Elegí un momento desde dentro de un rato hasta 90 días" });
    }
    const [row] = yield* query((db) =>
      db
        .insert(eventMessages)
        .values({
          eventId: event.id,
          audience: STORED[input.to],
          subject: input.subject,
          body: input.body,
          sendAt,
          status: "scheduled",
          createdById: me.id,
        })
        .returning()
    );
    yield* recordActivity({
      eventId: event.id,
      verb: "event.message_scheduled",
      entityType: "event",
      entityId: event.id,
      summary: `programó «${input.subject}» para el ${shortWhen(sendAt)}`,
    });

    return toMessage(row, me.name);
  });

/** Call off a message that hasn't gone out. */
export const cancelScheduled = (input: { eventId: string; messageId: string }) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const event = yield* targetOf(input.eventId, communityId);
    const [row] = yield* query((db) =>
      db
        .update(eventMessages)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(eventMessages.id, input.messageId),
            eq(eventMessages.eventId, event.id),
            eq(eventMessages.status, "scheduled")
          )
        )
        .returning()
    );
    if (!row) {
      return yield* new Conflict({ reason: "not_scheduled", message: "Ese mensaje ya salió o ya estaba cancelado" });
    }

    return toMessage(row, null);
  });

/** The event's messages, newest first: what went out, what's waiting, what was called off. */
export const list = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const event = yield* targetOf(eventId, communityId);
    const rows = yield* query((db) =>
      db
        .select({ message: eventMessages, by: user.name })
        .from(eventMessages)
        .leftJoin(user, eq(user.id, eventMessages.createdById))
        .where(eq(eventMessages.eventId, event.id))
        .orderBy(desc(eventMessages.sendAt))
        .limit(50)
    );

    return rows.map((row) => toMessage(row.message, row.by));
  });

/** The message as written, to the organizer asking only, marked [Prueba]. Once a minute at most. */
export const test = (input: { eventId: string; subject: string; body: string }) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const me = yield* CurrentUser;
    const event = yield* targetOf(input.eventId, communityId);
    const [account] = yield* query((db) => db.select({ email: user.email }).from(user).where(eq(user.id, me.id)));
    if (!account?.email) return yield* new Invalid({ message: "Tu cuenta no tiene un mail donde mandar la prueba" });
    const content = eventMessageEmail({
      community: event.community,
      event: event.name,
      subject: input.subject,
      body: input.body,
      pageUrl: appUrl(eventPagePath(event.communitySlug, event.slug)),
      // As people get it: their own link; the organizer's, so the test looks the same
      unsubscribeUrl: (yield* optionalMail(account.email))?.url ?? appUrl("/email/baja"),
    });
    yield* enqueueEmail({
      kind: "event_message_test",
      to: account.email,
      priority: 3,
      dedupeKey: `event_message_test:${event.id}:${me.id}:${fingerprint(input.subject, input.body)}:${Math.floor(Date.now() / 60_000)}`,
      ...content,
      subject: `[Prueba] ${content.subject}`,
    });

    return { to: account.email };
  });

/**
 * Scheduled messages whose time came: each one claimed under a row lock (two ticks at once never
 * send it twice; the outbox key makes a retry after a crash safe), sent, and logged as sent.
 */
export const sendScheduled = Effect.gen(function* () {
  const due = yield* query((db) =>
    db
      .select({ id: eventMessages.id })
      .from(eventMessages)
      .where(and(eq(eventMessages.status, "scheduled"), lte(eventMessages.sendAt, new Date())))
      .limit(50)
  );
  let sent = 0;
  for (const { id } of due) {
    sent += yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .select({ message: eventMessages, communityId: events.communityId })
            .from(eventMessages)
            .innerJoin(events, eq(events.id, eventMessages.eventId))
            .where(and(eq(eventMessages.id, id), eq(eventMessages.status, "scheduled")))
            .for("update", { of: eventMessages, skipLocked: true })
        );
        if (!row) return 0;
        const event = yield* targetOf(row.message.eventId, row.communityId);
        if (event.status === "cancelled") {
          yield* query((db) => db.update(eventMessages).set({ status: "cancelled" }).where(eq(eventMessages.id, id)));
          return 0;
        }
        const count = yield* deliver(event, {
          audiences: [fromStored(row.message.audience)],
          subject: row.message.subject,
          body: row.message.body,
          key: `event_message:${row.message.id}`,
        });
        yield* query((db) =>
          db
            .update(eventMessages)
            .set({ status: "sent", recipients: count, sentAt: new Date() })
            .where(eq(eventMessages.id, id))
        );

        return count;
      })
    );
  }

  return { messages: due.length, sent };
});
