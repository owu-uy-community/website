import { createLoggerStorage } from "@orpc/evlog/node";
import { waitUntil } from "@vercel/functions";
import type { DrainContext } from "evlog";
import { createSentryDrain } from "evlog/sentry";

/**
 * Wide events: one structured log per request, enriched as it goes (who
 * called, which community and event, what the procedure did, how it ended).
 * They print to stdout — pretty in dev, JSON on Vercel — and warnings and
 * errors also go to Sentry Logs when a DSN is configured.
 */

export const { storage: loggerStorage, useLogger: requestLogger } = createLoggerStorage();

/**
 * The current request's wide event, or nothing when there is no request
 * (scripts, server components, tests calling procedures directly).
 */
export function wideEvent() {
  try {
    return requestLogger();
  } catch {
    return undefined;
  }
}

const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const toSentry = sentryDsn ? createSentryDrain({ dsn: sentryDsn, release: process.env.VERCEL_GIT_COMMIT_SHA }) : null;

/** Options for evlog's oRPC plugin and Next wrappers. */
export const evlogOptions = {
  storage: loggerStorage,
  waitUntil,
  drain: (context: DrainContext) => {
    if (!toSentry) return;
    const { level } = context.event;
    if (level === "warn" || level === "error" || level === "fatal") return toSentry(context);
  },
};
