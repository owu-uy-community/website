import type { captureRouterTransitionStart } from "@sentry/nextjs";

import { loadSentry } from "./lib/errors/client";
import { beforeSend, dataCollection, tracesSampleRate } from "./lib/sentry/options";

let onTransition: typeof captureRouterTransitionStart | undefined;

// The SDK starts once the page is idle, so hydration never waits for it (the page-load trace still
// starts at navigation). Without a DSN nothing loads at all.
const whenIdle = window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1));

whenIdle(() =>
  loadSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: tracesSampleRate(process.env.NEXT_PUBLIC_VERCEL_ENV),
      dataCollection,
      beforeSend,
    });
    onTransition = Sentry.captureRouterTransitionStart;
  })
);

export const onRouterTransitionStart: typeof captureRouterTransitionStart = (...args) => onTransition?.(...args);
