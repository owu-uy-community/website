import { ORPCError } from "@orpc/client";
import * as Sentry from "@sentry/nextjs";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "./client";

vi.mock(import("@sentry/nextjs"), () => ({
  addBreadcrumb: vi.fn<typeof Sentry.addBreadcrumb>(),
  captureException: vi.fn<typeof Sentry.captureException>(),
}));

function setup() {
  vi.mocked(Sentry.captureException).mockClear();
  vi.mocked(Sentry.addBreadcrumb).mockClear();
}

describe(reportError, () => {
  test("a crash becomes a Sentry event tagged with what the user was doing", () => {
    setup();
    const error = new ORPCError("INTERNAL_SERVER_ERROR");

    reportError(error, { action: "mutation", procedure: "tracks.create" });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { action: "mutation", procedure: "tracks.create" },
    });
  });

  test("an expected refusal or a dropped connection leaves only a breadcrumb", () => {
    setup();

    reportError(new ORPCError("CONFLICT", { message: "Slot taken" }), { action: "mutation" });
    reportError(new TypeError("Failed to fetch"), { action: "query" });

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(vi.mocked(Sentry.addBreadcrumb).mock.calls.map(([crumb]) => crumb.message)).toStrictEqual([
      "mutation: CONFLICT: Slot taken",
      "query: TypeError: Failed to fetch",
    ]);
  });
});
