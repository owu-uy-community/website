import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerSentry } = await import("./lib/sentry/server");
    initServerSentry();
  }
}

/** Errors from server components, route handlers and the proxy. */
export const onRequestError = Sentry.captureRequestError;
