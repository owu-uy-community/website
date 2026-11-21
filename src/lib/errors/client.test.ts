import { ORPCError } from "@orpc/client";
import * as Sentry from "@sentry/nextjs";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "./client";

vi.mock(import("@sentry/nextjs"), () => ({
  addBreadcrumb: vi.fn<typeof Sentry.addBreadcrumb>(),
  captureException: vi.fn<typeof Sentry.captureException>(),
}));

function setup() {
  // The SDK only loads when a DSN is configured
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@sentry.example/1");
  vi.mocked(Sentry.captureException).mockClear();
  vi.mocked(Sentry.addBreadcrumb).mockClear();
}

describe(reportError, () => {
  test("a crash becomes a Sentry event tagged with what the user was doing", async () => {
    setup();
    const error = new ORPCError("INTERNAL_SERVER_ERROR");

    await reportError(error, { action: "mutation", procedure: "tracks.create" });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { action: "mutation", procedure: "tracks.create" },
    });
  });

  test("an expected refusal or a dropped connection leaves only a breadcrumb", async () => {
    setup();

    await reportError(new ORPCError("CONFLICT", { message: "Slot taken" }), { action: "mutation" });
    await reportError(new TypeError("Failed to fetch"), { action: "query" });

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(vi.mocked(Sentry.addBreadcrumb).mock.calls.map(([crumb]) => crumb.message)).toStrictEqual([
      "mutation: CONFLICT: Slot taken",
      "query: TypeError: Failed to fetch",
    ]);
  });

  test("without a DSN the SDK never loads and nothing is reported", async () => {
    setup();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    await reportError(new Error("boom"), { action: "query" });

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
