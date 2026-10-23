import { isExpectedError } from "../sentry/options";

/**
 * The browser SDK, imported on demand so it never weighs on a page load. Without a DSN the import
 * compiles away (NEXT_PUBLIC_ values are inlined at build) and every report is a no-op.
 */
export const loadSentry = async () => (process.env.NEXT_PUBLIC_SENTRY_DSN ? import("@sentry/nextjs") : undefined);

/** A request the browser never completed (offline, navigation away, aborted). Not our bug. */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return (
    error.name === "AbortError" || (error.name === "TypeError" && /fetch|network|load failed/i.test(error.message))
  );
}

/** "CONFLICT: Slot is already occupied", "TypeError: Failed to fetch". */
function describe(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const { code, name, message } = error as { code?: unknown; name?: unknown; message?: unknown };

  return `${typeof code === "string" ? code : String(name)}: ${String(message)}`;
}

/**
 * Report an error the UI ran into. Expected API answers (validation, auth, a
 * taken slot) and connectivity drops leave a breadcrumb only; everything else
 * becomes a Sentry event tagged with what the user was doing.
 */
export async function reportError(error: unknown, context: { action: string; procedure?: string }): Promise<void> {
  const Sentry = await loadSentry();
  if (!Sentry) return;

  if (isExpectedError(error) || isNetworkError(error)) {
    Sentry.addBreadcrumb({ category: "error", level: "info", message: `${context.action}: ${describe(error)}` });

    return;
  }

  Sentry.captureException(error, {
    tags: { action: context.action, ...(context.procedure ? { procedure: context.procedure } : {}) },
  });
}
