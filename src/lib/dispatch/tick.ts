import { and, inArray, lte } from "drizzle-orm";
import { Effect } from "effect";

import { outboundMessages } from "../db/schema";
import { drainEmail } from "../email/outbox";
import * as Comms from "../orpc/comms/service";
import { remindExpiringHolds } from "../orpc/events/service";
import { expireRequests } from "../orpc/venues/service";
import { query } from "../orpc/db";
import { liveServices, type AppServices } from "../orpc/services";

/** Scheduled event messages (Slack, Telegram, Owy) whose time has come, with no admin tab open. */
const dueComms = Effect.gen(function* () {
  const due = yield* query((db) =>
    db
      .selectDistinct({ eventId: outboundMessages.eventId })
      .from(outboundMessages)
      .where(
        and(inArray(outboundMessages.status, ["scheduled", "sending"]), lte(outboundMessages.scheduledAt, new Date()))
      )
  );
  let sent = 0;
  let failed = 0;
  for (const { eventId } of due) {
    const result = yield* Comms.dispatchDue(eventId);
    sent += result.sent;
    failed += result.failed;
  }

  return { events: due.length, sent, failed };
});

/**
 * Everything time-driven, in order, each safe to run twice at once. Called every 5 minutes by
 * QStash and once a day by the Vercel cron; a sweep that throws is reported and the rest still run.
 */
const SWEEPS: Record<string, (deadline: number) => Effect.Effect<unknown, unknown, AppServices>> = {
  comms: () => dueComms,
  holds: () => remindExpiringHolds,
  venues: () => expireRequests,
  // Last, so what the sweeps above queued goes out in the same tick
  email: (deadline: number) => drainEmail({ deadline }),
};

export async function tick(budgetMs: number) {
  const deadline = Date.now() + budgetMs;
  const results: Record<string, unknown> = {};
  const run = Effect.runPromiseWith(liveServices);

  for (const [name, sweep] of Object.entries(SWEEPS)) {
    if (Date.now() >= deadline) {
      results[name] = "skipped: out of time";
      continue;
    }
    try {
      results[name] = await run(sweep(deadline));
    } catch (error) {
      console.error(`[tick] ${name} failed`, error);
      results[name] = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return results;
}
