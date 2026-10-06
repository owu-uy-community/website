import * as Sentry from "@sentry/nextjs";

import { beforeSend, dataCollection, tracesSampleRate } from "./options";

/** Server-side Sentry. A deployment without SENTRY_DSN (local dev, tests) reports nothing. */
export function initServerSentry(dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN): boolean {
  if (!dsn) return false;

  Sentry.init({
    dsn,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: tracesSampleRate(),
    dataCollection,
    beforeSend,
  });

  return true;
}
