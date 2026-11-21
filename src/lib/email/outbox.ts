import { and, asc, count, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";
import { Effect } from "effect";

import { emailDeliveries, type EmailDeliveryRow } from "../db/schema";
import { query } from "../orpc/db";
import { soon } from "../soon";
import { liveServices } from "../orpc/services";
import { canSendEmail, sendEmail, SendFailed, type Email } from "./send";

/** Wait before retry n (1-based); after the last one the email is given up as failed. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
/** A row "sending" this long crashed mid-send; the idempotency key makes resending it safe. */
const STALE_SENDING_MS = 10 * 60_000;

export type QueuedEmail = Email & { kind: string; dedupeKey: string; priority?: number };

/** Email queued recently by this instance: the fast drain looks for a while (see soon.ts) */
const drains = soon();

/**
 * Queue an email. Call it inside the transaction that causes it, so both commit or neither does.
 * The same `dedupeKey` twice queues one email.
 */
export const enqueueEmail = (email: QueuedEmail) =>
  Effect.sync(() => {
    drains.mark();
  }).pipe(Effect.andThen(enqueueRow(email)));

const enqueueRow = (email: QueuedEmail) =>
  query((db) =>
    db
      .insert(emailDeliveries)
      .values({
        kind: email.kind,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers ?? {},
        attachments: email.attachments ?? [],
        dedupeKey: email.dedupeKey,
        priority: email.priority ?? 5,
      })
      .onConflictDoNothing({ target: emailDeliveries.dedupeKey })
  );

const settle = (row: EmailDeliveryRow) =>
  Effect.tryPromise({ try: () => sendEmail(row, row.id), catch: (cause) => cause }).pipe(
    Effect.flatMap(({ id }) =>
      query((db) =>
        db
          .update(emailDeliveries)
          .set({ status: "sent", providerId: id, sentAt: new Date(), error: null })
          .where(eq(emailDeliveries.id, row.id))
      ).pipe(Effect.as("sent" as const))
    ),
    Effect.catch((cause) => {
      const permanent = cause instanceof SendFailed && !cause.retryable;
      const wait = BACKOFF_MS[row.attempts - 1];
      const giveUp = permanent || wait === undefined;

      return query((db) =>
        db
          .update(emailDeliveries)
          .set({
            status: giveUp ? "failed" : "queued",
            claimedAt: null,
            nextAttemptAt: new Date(Date.now() + (wait ?? 0)),
            error: String(cause instanceof Error ? cause.message : cause).slice(0, 500),
          })
          .where(eq(emailDeliveries.id, row.id))
      ).pipe(Effect.as(giveUp ? ("failed" as const) : ("retry" as const)));
    })
  );

/**
 * What's left of today under `EMAIL_DAILY_CAP` (the email plan's limit; unset means no limit).
 * Past 80 % only what can't wait goes out: codes, seat offers and confirmations (priority ≤ 3).
 */
export function allowance(sentToday: number, cap = Number(process.env.EMAIL_DAILY_CAP) || Infinity) {
  return { room: Math.max(0, cap - sentToday), maxPriority: sentToday >= cap * 0.8 ? 3 : Infinity };
}

// ponytail: counted per batch, so drains running at once can pass the cap by a batch or two
const sentToday = query((db) =>
  db
    .select({ sent: count() })
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.status, "sent"), gt(emailDeliveries.sentAt, new Date(Date.now() - 86_400_000))))
).pipe(Effect.map(([row]) => row?.sent ?? 0));

/**
 * Send what's due, best first. Each run claims its rows with FOR UPDATE SKIP LOCKED, so the
 * QStash tick, the daily cron and a fast path can all drain at once without sending anything twice.
 * Stops claiming when `deadline` (epoch ms) passes.
 */
export const drainEmail = ({ deadline, batch = 25 }: { deadline: number; batch?: number }) =>
  Effect.gen(function* () {
    const tally = { sent: 0, retry: 0, failed: 0 };
    if (!canSendEmail()) return tally;

    yield* query((db) =>
      db
        .update(emailDeliveries)
        .set({ status: "queued", claimedAt: null })
        .where(
          and(
            eq(emailDeliveries.status, "sending"),
            lt(emailDeliveries.claimedAt, new Date(Date.now() - STALE_SENDING_MS))
          )
        )
    );

    while (Date.now() < deadline) {
      const { room, maxPriority } = process.env.EMAIL_DAILY_CAP ? allowance(yield* sentToday) : allowance(0);
      if (room === 0) break;
      const claimed = yield* query((db) => {
        const due = db
          .select({ id: emailDeliveries.id })
          .from(emailDeliveries)
          .where(
            and(
              eq(emailDeliveries.status, "queued"),
              lte(emailDeliveries.nextAttemptAt, new Date()),
              Number.isFinite(maxPriority) ? lte(emailDeliveries.priority, maxPriority) : undefined
            )
          )
          .orderBy(asc(emailDeliveries.priority), asc(emailDeliveries.createdAt))
          .limit(Math.min(batch, room))
          .for("update", { skipLocked: true });

        return db
          .update(emailDeliveries)
          .set({ status: "sending", claimedAt: new Date(), attempts: sql`${emailDeliveries.attempts} + 1` })
          .where(and(inArray(emailDeliveries.id, due), eq(emailDeliveries.status, "queued")))
          .returning();
      });
      if (claimed.length === 0) break;

      for (const outcome of yield* Effect.forEach(claimed, settle, { concurrency: 5 })) tally[outcome] += 1;
    }

    return tally;
  });

/**
 * The fast path: right after a response that queued email, send it from the same instance, so a
 * host's request or a confirmation doesn't wait for the next tick. The tick still catches anything
 * this misses.
 */
export async function drainSoon() {
  if (!drains.pending() || !canSendEmail()) return;
  await Effect.runPromiseWith(liveServices)(drainEmail({ deadline: Date.now() + 15_000 })).catch((error: unknown) =>
    console.error("[email] fast drain failed", error)
  );
}
