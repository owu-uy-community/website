import { and, inArray, lte } from "drizzle-orm";
import { Effect } from "effect";

import { syncOwuSlack } from "../authz/slack-sync";
import { outboundMessages } from "../db/schema";
import { drainEmail } from "../email/outbox";
import * as Comms from "../orpc/comms/service";
import { publishDue, remindExpiringHolds } from "../orpc/events/service";
import { pushDue } from "../orpc/integrations/service";
import { expireOffers, sendFeedback, sendReminders, sendUpdates } from "../orpc/rsvps/service";
import { sendHostDaySheets, sendYearlyChecks } from "../orpc/venues/hosting";
import { expireRequests } from "../orpc/venues/service";
import { query } from "../orpc/db";
import { liveServices, type AppServices } from "../orpc/services";
import { retention } from "./retention";

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
  // First, so an announcement it queues goes out with the comms sweep below
  scheduled: () => publishDue,
  comms: () => dueComms,
  offers: () => expireOffers,
  updates: () => sendUpdates,
  reminders: () => sendReminders,
  feedback: () => sendFeedback,
  holds: () => remindExpiringHolds,
  venues: () => expireRequests,
  hostDays: () => sendHostDaySheets,
  publications: (deadline: number) => pushDue({ deadline }),
  // Last, so what the sweeps above queued goes out in the same tick
  email: (deadline: number) => drainEmail({ deadline }),
};

/** `daily`: the once-a-day cron also runs retention, checks who left the OWU Slack and asks spaces' contacts if they still host. */
export async function tick(budgetMs: number, { daily = false } = {}) {
  const deadline = Date.now() + budgetMs;
  const results: Record<string, unknown> = {};
  const run = Effect.runPromiseWith(liveServices);
  const sweeps = daily
    ? {
        ...SWEEPS,
        retention: () => retention(),
        slack: () => Effect.promise(() => syncOwuSlack()),
        venueChecks: () => sendYearlyChecks,
      }
    : SWEEPS;

  for (const [name, sweep] of Object.entries(sweeps)) {
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
