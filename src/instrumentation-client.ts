import { captureRouterTransitionStart, init } from "@sentry/nextjs";

import { beforeSend, dataCollection, tracesSampleRate } from "./lib/sentry/options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  init({
    dsn,
    tracesSampleRate: tracesSampleRate(process.env.NEXT_PUBLIC_VERCEL_ENV),
    dataCollection,
    beforeSend,
  });
}

export const onRouterTransitionStart = captureRouterTransitionStart;
