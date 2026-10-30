import { ORPCError } from "@orpc/client";
import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, test } from "vitest";

import { beforeSend, isAlreadyReported, isExpectedError, tracesSampleRate } from "./options";

function makeEvent(headers: Record<string, string> = {}): ErrorEvent {
  return { type: undefined, request: { headers: { ...headers }, cookies: { session: "secret" } } };
}

describe(isExpectedError, () => {
  test("the API's deliberate refusals are expected; crashes and upstream failures are not", () => {
    const expected = ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "TOO_MANY_REQUESTS"];
    const reported = ["INTERNAL_SERVER_ERROR", "BAD_GATEWAY", "OCR_FAILED"];

    expect(expected.map((code) => isExpectedError(new ORPCError(code)))).toStrictEqual(expected.map(() => true));
    expect(reported.map((code) => isExpectedError(new ORPCError(code)))).toStrictEqual(reported.map(() => false));
    expect(isExpectedError(new Error("boom"))).toBe(false);
    expect(isExpectedError({ code: 404 })).toBe(false);
  });
});

describe(isAlreadyReported, () => {
  test("only an error that carries a Sentry event id counts as reported", () => {
    expect(isAlreadyReported(new ORPCError("INTERNAL_SERVER_ERROR", { data: { eventId: "abc" } }))).toBe(true);
    expect(isAlreadyReported(new ORPCError("INTERNAL_SERVER_ERROR"))).toBe(false);
    expect(isAlreadyReported(null)).toBe(false);
  });
});

describe(beforeSend, () => {
  test("drops expected and already-reported errors", () => {
    expect(beforeSend(makeEvent(), { originalException: new ORPCError("CONFLICT") })).toBeNull();
    expect(
      beforeSend(makeEvent(), {
        originalException: new ORPCError("INTERNAL_SERVER_ERROR", { data: { eventId: "abc" } }),
      })
    ).toBeNull();
  });

  test("keeps real failures but strips credentials", () => {
    const event = beforeSend(
      makeEvent({ Cookie: "a=b", Authorization: "Bearer x", "x-api-key": "k", "user-agent": "Safari" }),
      { originalException: new Error("boom") }
    );

    expect(event?.request?.headers).toStrictEqual({ "user-agent": "Safari" });
    expect(event?.request?.cookies).toBeUndefined();
  });
});

describe(tracesSampleRate, () => {
  test("samples a tenth of production and everything elsewhere", () => {
    expect([tracesSampleRate("production"), tracesSampleRate("preview"), tracesSampleRate(undefined)]).toStrictEqual([
      0.1, 1, 1,
    ]);
  });
});
