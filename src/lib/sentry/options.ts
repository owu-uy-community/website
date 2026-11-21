import type { ErrorEvent, EventHint, init } from "@sentry/nextjs";

type SentryOptions = NonNullable<Parameters<typeof init>[0]>;

/**
 * Error codes that describe a request the API refused on purpose: bad input,
 * no session, no permission, a taken slot. They are answers, not failures,
 * and never go to Sentry. Anything else — INTERNAL_SERVER_ERROR, BAD_GATEWAY,
 * a crash — does.
 */
export const EXPECTED_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "PAYLOAD_TOO_LARGE",
  "UNPROCESSABLE_CONTENT",
  "METHOD_NOT_SUPPORTED",
]);

/** True for an oRPC error (server or client side) the API raised deliberately. */
export function isExpectedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const { code } = error as { code: unknown };

  return typeof code === "string" && EXPECTED_ERROR_CODES.has(code);
}

/**
 * True when the error is a crash the error boundary already reported and
 * replaced with a sanitized `INTERNAL_SERVER_ERROR { eventId }`; re-reporting
 * it from Next's onRequestError would count one crash twice.
 */
export function isAlreadyReported(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { data } = error as { data?: unknown };

  return typeof data === "object" && data !== null && typeof (data as { eventId?: unknown }).eventId === "string";
}

const SECRET_HEADERS = ["cookie", "authorization", "x-api-key"];

/** Last line of defence before an event leaves: drop expected errors, strip credentials. */
export function beforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isExpectedError(hint.originalException) || isAlreadyReported(hint.originalException)) return null;

  const headers = event.request?.headers;
  if (headers) {
    for (const name of Object.keys(headers)) {
      if (SECRET_HEADERS.includes(name.toLowerCase())) delete headers[name];
    }
  }
  if (event.request) delete event.request.cookies;

  return event;
}

/**
 * What the SDK may collect. Sentry 11 collects everything by default
 * (bodies, cookies, AI inputs); this keeps request metadata and drops the rest.
 * Talk proposals and card photos are personal data, so AI inputs/outputs stay out.
 */
export const dataCollection: SentryOptions["dataCollection"] = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent", "content-type", "referer", "accept-language"] }, response: false },
  httpBodies: [],
  urlQueryParams: true,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
};

/** Every trace in development and previews, a tenth in production. */
export function tracesSampleRate(vercelEnv = process.env.VERCEL_ENV): number {
  return vercelEnv === "production" ? 0.1 : 1;
}
