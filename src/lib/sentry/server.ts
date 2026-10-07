import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { ORPCInstrumentation } from "@orpc/opentelemetry";
import * as Sentry from "@sentry/nextjs";

import { beforeSend, dataCollection, tracesSampleRate } from "./options";

/**
 * Server-side Sentry. A deployment without SENTRY_DSN (local dev, tests)
 * reports nothing. Sentry for Next.js sets up OpenTelemetry itself, so
 * registering oRPC's instrumentation afterwards puts a span per procedure (and
 * per middleware) into Sentry's traces.
 */
export function initServerSentry(dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN): boolean {
  if (!dsn) return false;

  Sentry.init({
    dsn,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: tracesSampleRate(),
    dataCollection,
    beforeSend,
  });
  registerInstrumentations({ instrumentations: [new ORPCInstrumentation()] });

  return true;
}
