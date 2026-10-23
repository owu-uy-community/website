import { and, desc, eq, inArray, lt, lte, ne, or, type SQL } from "drizzle-orm";
import { Effect, Result } from "effect";
import type * as z from "zod";

import {
  account,
  activity,
  communities,
  events,
  outboundMessages,
  surveys,
  user,
  type OutboundMessageRow,
  type RemoteRef,
} from "../../db/schema";
import {
  deleteRemote,
  editRemote,
  owyChannels,
  sendSlackChannel,
  sendSlackDm,
  sendTelegram,
} from "../../owy/messaging";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound, UpstreamFailed, type ForeignKeyViolation, type UniqueViolation } from "../errors";
import { opsPing, recordActivity } from "../ops";
import { CommunityScope, CurrentUser, type Database } from "../services";
import * as StaffTasks from "../staff-tasks/service";
import { CADENCE_STEPS, cadencePlan, formatWhen, type CadenceStepKey } from "./cadence";
import type {
  Cadence,
  Channels,
  MarkSentSchema,
  MessageRefSchema,
  OutboundMessage,
  RemindSchema,
  RemoveMessageSchema,
  ScheduleMessageSchema,
  SendMessageSchema,
  UpdateMessageSchema,
} from "./schemas";

type SendInput = z.infer<typeof SendMessageSchema>;
type ScheduleInput = z.infer<typeof ScheduleMessageSchema>;
type UpdateInput = z.infer<typeof UpdateMessageSchema>;
type MessageRef = z.infer<typeof MessageRefSchema>;
type RemoveInput = z.infer<typeof RemoveMessageSchema>;
type MarkSentInput = z.infer<typeof MarkSentSchema>;
type RemindInput = z.infer<typeof RemindSchema>;

const CHANNEL_WORDS: Record<OutboundMessageRow["channel"], string> = {
  telegram: "Telegram",
  slack: "Slack",
  staff_dm: "mensaje directo",
  email: "email",
};

/** A send that started this long ago and never finished died with its tab or its function. */
const STALE_SENDING_MS = 5 * 60_000;
/** Some slack for clocks and "send now", which is "now" when the click left the browser. */
const PAST_GRACE_MS = 60_000;

const siteUrl = () => (process.env.NEXT_PUBLIC_BASE_URL ?? "https://owu.uy").replace(/\/$/, "");
const telegramHandle = () => process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null;

/** «Mañana es OWU CONF…»: a message as one short line, for the activity log. */
const quote = (body: string) => {
  const line = body.replace(/\s+/g, " ").trim();
  return `«${line.length > 60 ? `${line.slice(0, 57)}…` : line}»`;
};

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });
const messageNotFound = new NotFound({ entity: "message", message: "Ese mensaje no es de este evento" });

/** The event, with its community's slug for the links in the copy. */
const eventOf = (eventId: string) =>
  query((db) =>
    db
      .select({ event: events, communitySlug: communities.slug })
      .from(events)
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(eq(events.id, eventId))
  ).pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : Effect.fail(eventNotFound))));

type Creator = { id: string; name: string; image: string | null } | null;

const toMessage = ({ message, creator }: { message: OutboundMessageRow; creator: Creator }): OutboundMessage => ({
  id: message.id,
  channel: message.channel,
  body: message.body,
  status: message.status,
  scheduledAt: message.scheduledAt?.toISOString() ?? null,
  sentAt: message.sentAt?.toISOString() ?? null,
  error: message.error,
  step: message.step,
  recipients: message.recipientIds.length,
  createdBy: creator,
  createdAt: message.createdAt.toISOString(),
  editedAt: message.editedAt?.toISOString() ?? null,
  remote: message.remoteRefs.length,
});

const messagesWhere = (where: SQL | undefined) =>
  query((db) =>
    db
      .select({ message: outboundMessages, creator: { id: user.id, name: user.name, image: user.image } })
      .from(outboundMessages)
      .leftJoin(user, eq(user.id, outboundMessages.createdById))
      .where(where)
      .orderBy(desc(outboundMessages.createdAt))
      .limit(200)
  ).pipe(Effect.map((rows) => rows.map(toMessage)));

const messageIn = (eventId: string, messageId: string) =>
  messagesWhere(and(eq(outboundMessages.id, messageId), eq(outboundMessages.eventId, eventId))).pipe(
    Effect.flatMap(([message]) => (message ? Effect.succeed(message) : Effect.fail(messageNotFound)))
  );

const ensureFuture = (at: Date) =>
  at.getTime() < Date.now() - PAST_GRACE_MS
    ? Effect.fail(new Invalid({ message: "Esa hora ya pasó: elegí una más adelante o mandalo ahora" }))
    : Effect.void;

/**
 * One live message per cadence step: the shell counts them for the checklist, and the cadence
 * shows one per step. A failed one can be tried again. Runs under the event's row lock, so two
 * admins scheduling the same step at once can't both pass.
 */
const ensureStepFree = (eventId: string, step: CadenceStepKey) =>
  Effect.gen(function* () {
    yield* query((db) => db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("update"));
    const [taken] = yield* query((db) =>
      db
        .select({ status: outboundMessages.status })
        .from(outboundMessages)
        .where(
          and(
            eq(outboundMessages.eventId, eventId),
            eq(outboundMessages.step, step),
            ne(outboundMessages.status, "failed")
          )
        )
        .limit(1)
    );
    if (!taken) return;

    return yield* new Conflict({
      reason: "step_taken",
      message:
        taken.status === "scheduled"
          ? "Ese paso ya tiene un mensaje programado: editalo o cancelalo"
          : "Ese paso ya salió",
    });
  });

/** Slack user ids of these people, from their Slack sign-in. */
const slackAccounts = (userIds: readonly string[]) =>
  userIds.length === 0
    ? Effect.succeed([])
    : query((db) =>
        db
          .select({ userId: account.userId, slackId: account.accountId })
          .from(account)
          .where(and(eq(account.providerId, "slack"), inArray(account.userId, [...userIds])))
      );

/** Where a message's copies landed, and why it failed if it did. */
type Delivery = { refs: RemoteRef[]; error: string | null };

/** One post: where it landed, or why it didn't. */
const posted = <R>(sending: Effect.Effect<RemoteRef | null, UpstreamFailed, R>) =>
  sending.pipe(
    Effect.map((ref): Delivery => ({ refs: ref ? [ref] : [], error: null })),
    Effect.catchTag("UpstreamFailed", (failure) => Effect.succeed<Delivery>({ refs: [], error: failure.message }))
  );

/**
 * Hand a message to Owy, keeping where each copy landed so it can be edited or deleted there.
 * Every DM is tried; any that fails fails the whole message, saying how many (the ones that did
 * land are kept, so deleting it reaches them too).
 */
const deliver = (row: OutboundMessageRow): Effect.Effect<Delivery, UniqueViolation | ForeignKeyViolation, Database> => {
  switch (row.channel) {
    case "telegram":
      return posted(sendTelegram(row.body));
    case "slack":
      return posted(sendSlackChannel(row.body));
    case "staff_dm":
      return Effect.gen(function* () {
        const people = yield* slackAccounts(row.recipientIds);
        const results = yield* Effect.forEach(
          people,
          (person) => Effect.result(sendSlackDm(person.slackId, row.body)),
          {
            concurrency: 4,
          }
        );
        const refs = results.flatMap((result) => (Result.isSuccess(result) && result.success ? [result.success] : []));
        const failures = results.filter(Result.isFailure);

        return {
          refs,
          error:
            failures.length === 0
              ? null
              : `No le llegó a ${failures.length} de ${people.length}: ${failures[0].failure.message}`,
        };
      });
    case "email":
      // Recorded by hand, never sent from here.
      return Effect.succeed({ refs: [], error: null });
  }
};

/**
 * The outcome, with its line in the activity log credited to the message's author: a scheduled
 * message goes out from whichever admin's tab is open, but it is still theirs.
 */
const settle = (row: OutboundMessageRow, { refs, error }: Delivery) =>
  transaction(
    Effect.gen(function* () {
      const [done] = yield* query((db) =>
        db
          .update(outboundMessages)
          .set(
            error === null
              ? { status: "sent", sentAt: new Date(), error: null, remoteRefs: refs }
              : { status: "failed", error, remoteRefs: refs }
          )
          .where(eq(outboundMessages.id, row.id))
          .returning()
      );
      const ok = error === null;
      const what =
        row.channel === "staff_dm"
          ? `${ok ? "le escribió" : "no pudo escribirle"} por Owy a ${row.recipientIds.length} del staff`
          : `${ok ? "mandó" : "no pudo mandar"} por ${CHANNEL_WORDS[row.channel]}`;
      yield* query((db) =>
        db.insert(activity).values({
          eventId: row.eventId,
          actorId: row.createdById,
          verb: ok ? "message.sent" : "message.failed",
          entityType: "message",
          entityId: row.id,
          summary: `${what} ${quote(row.body)}`,
        })
      );

      return done;
    })
  );

const deliverAndSettle = (row: OutboundMessageRow) =>
  deliver(row).pipe(Effect.flatMap((delivery) => settle(row, delivery)));

const failedSend = (row: OutboundMessageRow) =>
  new UpstreamFailed({ service: "Owy", message: row.error ?? "El mensaje no salió" });

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Owy's messages for an event, newest first: scheduled, sent and failed (with the error). */
export const list = (eventId: string) =>
  Effect.gen(function* () {
    yield* eventOf(eventId);
    return yield* messagesWhere(eq(outboundMessages.eventId, eventId));
  });

/** Slack gets <, > and & escaped (organizar/announcement.ts); the board shows what people read. */
const slackUnescaped = (text: string) => text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

/**
 * What Owy told attendees, for the public live board: sent Telegram and Slack posts only — never
 * staff DMs, nor the record of an email someone sent by hand. Newest first.
 */
export const feed = (eventId: string) =>
  query((db) =>
    db
      .select({
        id: outboundMessages.id,
        channel: outboundMessages.channel,
        body: outboundMessages.body,
        sentAt: outboundMessages.sentAt,
        editedAt: outboundMessages.editedAt,
      })
      .from(outboundMessages)
      .where(
        and(
          eq(outboundMessages.eventId, eventId),
          eq(outboundMessages.status, "sent"),
          inArray(outboundMessages.channel, ["telegram", "slack"])
        )
      )
      .orderBy(desc(outboundMessages.sentAt))
      .limit(40)
  ).pipe(
    Effect.map((rows) => {
      const seen = new Set<string>();

      return rows
        .flatMap((row) => {
          const body = row.channel === "slack" ? slackUnescaped(row.body) : row.body;
          // ponytail: same text = one notice (it went to both channels); a deliberate repeat collapses too
          if (!row.sentAt || seen.has(body)) return [];
          seen.add(body);

          return [
            { id: row.id, body, sentAt: row.sentAt.toISOString(), editedAt: row.editedAt?.toISOString() ?? null },
          ];
        })
        .slice(0, 20);
    })
  );

/** Which channels Owy can write to from the site. */
export const channels = (): Channels => ({ ...owyChannels(), telegramHandle: telegramHandle() });

const STATUS_RANK: Record<OutboundMessage["status"], number> = { sent: 0, sending: 1, scheduled: 2, failed: 3 };

/** The conf's cadence: every step with its suggested time, its copy and the message that fulfils it. */
export const cadence = (eventId: string) =>
  Effect.gen(function* () {
    const { event, communitySlug } = yield* eventOf(eventId);
    const [messages, survey] = yield* Effect.all(
      [
        messagesWhere(and(eq(outboundMessages.eventId, eventId), inArray(outboundMessages.step, [...CADENCE_STEPS]))),
        query((db) => db.select({ isOpen: surveys.isOpen }).from(surveys).where(eq(surveys.eventId, eventId))),
      ],
      { concurrency: "unbounded" }
    );
    const agenda = `${siteUrl()}/comunidad/${communitySlug}/events/${event.slug}`;
    const handle = telegramHandle();
    const links = {
      agenda,
      survey: `${agenda}/encuesta`,
      map: event.venueMapUrl,
      owy: handle ? `https://t.me/${handle}` : null,
    };

    return {
      timezone: event.timezone,
      eventStart: event.startDate.toISOString(),
      eventEnd: event.endDate.toISOString(),
      links,
      surveyOpen: survey[0]?.isOpen ?? false,
      steps: cadencePlan(event, links).map((step) => {
        // Newest first already; the sort keeps that order within a status.
        const message =
          messages
            .filter((candidate) => candidate.step === step.key)
            .toSorted((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0] ?? null;

        return { ...step, at: step.at.toISOString(), message, status: message?.status ?? "missing" };
      }),
    } satisfies Cadence;
  });

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Send now. The attempt is recorded either way; a failure also comes back as the error. */
export const send = (input: SendInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    yield* eventOf(input.eventId);
    const row = yield* transaction(
      Effect.gen(function* () {
        if (input.step) yield* ensureStepFree(input.eventId, input.step);
        const [inserted] = yield* query((db) =>
          db
            .insert(outboundMessages)
            .values({
              eventId: input.eventId,
              channel: input.channel,
              body: input.body,
              step: input.step ?? null,
              status: "sending",
              sentAt: new Date(),
              createdById: me.id,
            })
            .returning()
        );
        return inserted;
      })
    );
    const done = yield* deliverAndSettle(row);
    yield* opsPing(input.eventId, "comms");
    if (done.status === "failed") return yield* failedSend(done);

    return yield* messageIn(input.eventId, row.id);
  });

export const schedule = (input: ScheduleInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const { event } = yield* eventOf(input.eventId);
    const at = new Date(input.scheduledAt);
    yield* ensureFuture(at);
    const id = yield* transaction(
      Effect.gen(function* () {
        if (input.step) yield* ensureStepFree(input.eventId, input.step);
        const [row] = yield* query((db) =>
          db
            .insert(outboundMessages)
            .values({
              eventId: input.eventId,
              channel: input.channel,
              body: input.body,
              step: input.step ?? null,
              scheduledAt: at,
              status: "scheduled",
              createdById: me.id,
            })
            .returning({ id: outboundMessages.id })
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "message.scheduled",
          entityType: "message",
          entityId: row.id,
          summary: `programó para el ${formatWhen(at, event.timezone)} por ${CHANNEL_WORDS[input.channel]} ${quote(input.body)}`,
        });
        return row.id;
      })
    );
    yield* opsPing(input.eventId, "comms");

    return yield* messageIn(input.eventId, id);
  });

/** Not (or no longer) waiting to go out: say which. */
const notScheduled = ({ eventId, messageId }: MessageRef, verb: string) =>
  messageIn(eventId, messageId).pipe(
    Effect.flatMap(() =>
      Effect.fail(
        new Conflict({ reason: "message_not_scheduled", message: `Ese mensaje ya salió: no se puede ${verb}` })
      )
    )
  );

/** The row as stored, with where it landed: what an edit or a delete of a sent message needs. */
const storedIn = (eventId: string, messageId: string) =>
  query((db) =>
    db
      .select()
      .from(outboundMessages)
      .where(and(eq(outboundMessages.id, messageId), eq(outboundMessages.eventId, eventId)))
  ).pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : Effect.fail(messageNotFound))));

/**
 * A message that already went out: only its text changes, rewritten where it landed (Telegram,
 * Slack) for everyone who has it; an email marked by hand, only here.
 */
const updateSent = (stored: OutboundMessageRow, input: UpdateInput) =>
  Effect.gen(function* () {
    if (stored.status !== "sent") {
      return yield* new Conflict({
        reason: "message_not_sent",
        message:
          stored.status === "sending"
            ? "Está saliendo: esperá a que termine"
            : "No salió: usá «Reintentar» para mandarlo",
      });
    }
    if (stored.channel === "staff_dm") {
      return yield* new Conflict({
        reason: "message_is_dm",
        message: "Los recordatorios por mensaje directo no se editan: borralo y volvé a reenviar el aviso",
      });
    }
    if ((input.channel !== undefined && input.channel !== stored.channel) || input.scheduledAt !== undefined) {
      return yield* new Invalid({ message: "Ya salió: solo se puede cambiar el texto" });
    }
    const body = input.body;
    if (body === undefined || body === stored.body) return yield* messageIn(input.eventId, input.messageId);
    if (stored.channel !== "email") {
      if (stored.remoteRefs.length === 0) {
        return yield* new Conflict({
          reason: "message_untracked",
          message: `Salió antes de que el sitio guardara dónde quedó: editalo a mano en ${CHANNEL_WORDS[stored.channel]}`,
        });
      }
      // There first: if Telegram or Slack says no, this list still shows what people have.
      yield* Effect.forEach(stored.remoteRefs, (ref) => editRemote(ref, body), { concurrency: 4, discard: true });
    }

    yield* transaction(
      Effect.gen(function* () {
        yield* query((db) =>
          db.update(outboundMessages).set({ body, editedAt: new Date() }).where(eq(outboundMessages.id, stored.id))
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "message.updated",
          entityType: "message",
          entityId: stored.id,
          summary: `editó lo que mandó por ${CHANNEL_WORDS[stored.channel]} ${quote(body)}`,
        });
      })
    );
    yield* opsPing(input.eventId, "comms");

    return yield* messageIn(input.eventId, input.messageId);
  });

/** Edit a message: while it waits to go out, its channel, text and time; once out, only its text. */
export const update = (input: UpdateInput) =>
  Effect.gen(function* () {
    yield* eventOf(input.eventId);
    const stored = yield* storedIn(input.eventId, input.messageId);
    if (stored.status !== "scheduled") return yield* updateSent(stored, input);

    const at = input.scheduledAt === undefined ? undefined : new Date(input.scheduledAt);
    if (at) yield* ensureFuture(at);
    const patch = {
      ...(input.channel === undefined ? {} : { channel: input.channel }),
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(at === undefined ? {} : { scheduledAt: at }),
    };
    if (Object.keys(patch).length === 0) return yield* messageIn(input.eventId, input.messageId);

    yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .update(outboundMessages)
            .set(patch)
            .where(
              and(
                eq(outboundMessages.id, input.messageId),
                eq(outboundMessages.eventId, input.eventId),
                eq(outboundMessages.status, "scheduled")
              )
            )
            .returning()
        );
        if (!row) return yield* notScheduled(input, "editar");

        yield* recordActivity({
          eventId: input.eventId,
          verb: "message.updated",
          entityType: "message",
          entityId: row.id,
          summary: `editó el mensaje programado ${quote(row.body)}`,
        });
      })
    );
    yield* opsPing(input.eventId, "comms");

    return yield* messageIn(input.eventId, input.messageId);
  });

/** Drop a message that hasn't gone out, or a T-7 marked as sent by mistake. */
export const cancel = (input: MessageRef) =>
  Effect.gen(function* () {
    const message = yield* messageIn(input.eventId, input.messageId);
    yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .delete(outboundMessages)
            .where(
              and(
                eq(outboundMessages.id, input.messageId),
                eq(outboundMessages.eventId, input.eventId),
                or(eq(outboundMessages.status, "scheduled"), eq(outboundMessages.channel, "email"))
              )
            )
            .returning()
        );
        if (!row) return yield* notScheduled(input, "cancelar");

        yield* recordActivity({
          eventId: input.eventId,
          verb: "message.cancelled",
          entityType: "message",
          entityId: row.id,
          summary:
            row.channel === "email"
              ? `desmarcó el email ${quote(row.body)}`
              : `canceló el mensaje programado ${quote(row.body)}`,
        });
      })
    );
    yield* opsPing(input.eventId, "comms");

    return message;
  });

/**
 * Delete a message for good: one waiting to go out, an email marked by hand, or one that went
 * out, which also goes where it landed (every staff DM too) unless `onlyHere`. Telegram only lets
 * a bot delete what it sent in the last 48 hours: past that it says no, and the message can
 * still leave this list on its own.
 */
export const remove = (input: RemoveInput) =>
  Effect.gen(function* () {
    const message = yield* messageIn(input.eventId, input.messageId);
    const stored = yield* storedIn(input.eventId, input.messageId);
    if (stored.status === "sending") {
      return yield* new Conflict({ reason: "message_sending", message: "Está saliendo: esperá a que termine" });
    }
    const there = input.onlyHere || stored.status === "scheduled" ? [] : stored.remoteRefs;
    yield* Effect.forEach(there, deleteRemote, { concurrency: 4, discard: true });

    yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .delete(outboundMessages)
            .where(and(eq(outboundMessages.id, stored.id), ne(outboundMessages.status, "sending")))
            .returning()
        );
        if (!row)
          return yield* new Conflict({ reason: "message_sending", message: "Empezó a salir: esperá a que termine" });

        const what =
          row.status === "scheduled"
            ? "borró el mensaje programado"
            : row.channel === "email"
              ? "desmarcó el email"
              : there.length === 0
                ? `quitó de la lista lo que mandó por ${CHANNEL_WORDS[row.channel]}`
                : row.channel === "staff_dm"
                  ? `borró de Slack ${there.length === 1 ? "el mensaje directo" : `los ${there.length} mensajes directos`}`
                  : `borró de ${CHANNEL_WORDS[row.channel]} el mensaje`;
        yield* recordActivity({
          eventId: input.eventId,
          verb: "message.deleted",
          entityType: "message",
          entityId: row.id,
          summary: `${what} ${quote(row.body)}`,
        });
      })
    );
    yield* opsPing(input.eventId, "comms");

    return message;
  });

/** A step that went out by other means: the T-7 email, sent from Eventbrite. */
export const markSent = (input: MarkSentInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    yield* eventOf(input.eventId);
    const id = yield* transaction(
      Effect.gen(function* () {
        yield* ensureStepFree(input.eventId, input.step);
        const [row] = yield* query((db) =>
          db
            .insert(outboundMessages)
            .values({
              eventId: input.eventId,
              channel: "email",
              body: input.body,
              step: input.step,
              status: "sent",
              sentAt: new Date(),
              createdById: me.id,
            })
            .returning({ id: outboundMessages.id })
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "message.sent",
          entityType: "message",
          entityId: row.id,
          summary: `marcó como enviado el email ${quote(input.body)}`,
        });
        return row.id;
      })
    );
    yield* opsPing(input.eventId, "comms");

    return yield* messageIn(input.eventId, id);
  });

/**
 * Send every scheduled message whose time has come.
 *
 * ponytail: there is no cron in this project, so the Comunicación page (and Hoy) call this every
 * minute while they are open: a scheduled message waits for an admin with the admin open. A cron
 * hitting the same procedure removes that limit.
 */
export const dispatchDue = (eventId: string) =>
  Effect.gen(function* () {
    yield* eventOf(eventId);
    const now = new Date();
    // It may or may not have gone out: say so rather than send it twice.
    const stale = yield* query((db) =>
      db
        .update(outboundMessages)
        .set({ status: "failed", error: "Se cortó mientras salía: fijate si llegó antes de reenviarlo" })
        .where(
          and(
            eq(outboundMessages.eventId, eventId),
            eq(outboundMessages.status, "sending"),
            lt(outboundMessages.sentAt, new Date(now.getTime() - STALE_SENDING_MS))
          )
        )
        .returning({ id: outboundMessages.id })
    );
    // One UPDATE claims the rows: with several tabs calling at once, Postgres lets exactly one of
    // them flip each row to "sending". `sentAt` holds the claim time until the send settles.
    const claimed = yield* query((db) =>
      db
        .update(outboundMessages)
        .set({ status: "sending", sentAt: now })
        .where(
          and(
            eq(outboundMessages.eventId, eventId),
            eq(outboundMessages.status, "scheduled"),
            lte(outboundMessages.scheduledAt, now)
          )
        )
        .returning()
    );
    const done = yield* Effect.forEach(claimed, deliverAndSettle);
    if (claimed.length > 0 || stale.length > 0) yield* opsPing(eventId, "comms");

    const sent = done.filter((row) => row.status === "sent").length;
    return { sent, failed: done.length - sent + stale.length };
  });

/** Owy DMs, on Slack, everyone who hasn't marked a staff announcement as received. */
export const remind = (input: RemindInput) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const { event, communitySlug } = yield* eventOf(input.eventId);
    const announcements = yield* StaffTasks.listAnnouncements(input.eventId).pipe(
      Effect.provideService(CommunityScope, { communityId: event.communityId, eventId: event.id })
    );
    const announcement = announcements.find((item) => item.id === input.announcementId);
    if (!announcement)
      return yield* new NotFound({ entity: "announcement", message: "Ese aviso no es de este evento" });
    if (announcement.pending.length === 0) return yield* new Invalid({ message: "Ya lo marcaron todos como recibido" });

    const people = yield* slackAccounts(announcement.pending.map((person) => person.userId));
    if (people.length === 0) {
      return yield* new Invalid({ message: "Nadie de los que faltan tiene Slack vinculado: avisales en persona" });
    }

    const author = announcement.author?.name ?? "El staff";
    const body = [
      `Hola, soy Owy. ${author} mandó un aviso${announcement.urgent ? " urgente" : ""} al staff y todavía no lo marcaste como recibido:`,
      "",
      announcement.body,
      "",
      `Marcalo acá: ${siteUrl()}/admin/${communitySlug}/mi-turno?event=${encodeURIComponent(event.slug)}`,
    ].join("\n");
    const [row] = yield* query((db) =>
      db
        .insert(outboundMessages)
        .values({
          eventId: input.eventId,
          channel: "staff_dm",
          body,
          recipientIds: [...new Set(people.map((person) => person.userId))],
          status: "sending",
          sentAt: new Date(),
          createdById: me.id,
        })
        .returning()
    );
    const done = yield* deliverAndSettle(row);
    yield* opsPing(input.eventId, "comms");
    if (done.status === "failed") return yield* failedSend(done);

    return { sent: row.recipientIds.length, withoutSlack: announcement.pending.length - row.recipientIds.length };
  });
