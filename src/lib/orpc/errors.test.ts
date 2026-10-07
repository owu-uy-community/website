import { ORPCError } from "@orpc/server";
import * as Sentry from "@sentry/nextjs";
import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import {
  Conflict,
  ForeignKeyViolation,
  Forbidden,
  Invalid,
  NotFound,
  toWireError,
  UniqueViolation,
  UpstreamFailed,
} from "./errors";

vi.mock(import("@sentry/nextjs"), () => ({ captureException: vi.fn<typeof Sentry.captureException>(() => "event-1") }));

const scope = { path: ["tracks", "create"] };

/** What a node-postgres error looks like, wrapped the way Drizzle wraps it. */
const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error("Failed query"), {
    cause: Object.assign(new Error("pg"), { code, constraint, severity: "ERROR" }),
  });

function wire(error: unknown) {
  return toWireError(error, scope) as ORPCError<string, unknown>;
}

describe(toWireError, () => {
  test("service errors become their typed wire error, message and data included", () => {
    expect(
      [
        wire(new NotFound({ entity: "track", message: "No existe" })),
        wire(new Conflict({ reason: "slot_taken", message: "Ocupado", occupiedBy: "Primera" })),
        wire(new Invalid({ message: "Mal" })),
        wire(new Forbidden({ message: "No" })),
        wire(new UpstreamFailed({ service: "Eventbrite", message: "Caído" })),
        wire(new Invalid({ message: "Revisá", issues: [{ path: ["song"], message: "Muy largo" }] })),
      ].map((error) => [error.code, error.message, error.data])
    ).toStrictEqual([
      ["NOT_FOUND", "No existe", { entity: "track" }],
      ["CONFLICT", "Ocupado", { reason: "slot_taken", occupiedBy: "Primera" }],
      ["BAD_REQUEST", "Mal", undefined],
      ["FORBIDDEN", "No", undefined],
      ["BAD_GATEWAY", "Caído", { service: "Eventbrite" }],
      ["BAD_REQUEST", "Revisá", { issues: [{ path: ["song"], message: "Muy largo" }] }],
    ]);
  });

  test("database violations nobody handled still say what kind of problem they are", () => {
    expect(
      [
        wire(new UniqueViolation({ constraint: "rooms_name_key", cause: null })),
        wire(new ForeignKeyViolation({ constraint: "tracks_roomId_fkey", cause: null })),
        wire(pgError("23505", "tracks_scheduleId_roomId_key")),
        wire(pgError("23503")),
        wire(pgError("22P02")),
      ].map((error) => [error.code, error.data])
    ).toStrictEqual([
      ["CONFLICT", { reason: "rooms_name_key" }],
      ["BAD_REQUEST", undefined],
      ["CONFLICT", { reason: "tracks_scheduleId_roomId_key" }],
      ["BAD_REQUEST", undefined],
      ["BAD_REQUEST", undefined],
    ]);
  });

  test("a schema that rejects data mid-procedure is a BAD_REQUEST carrying the issues", () => {
    const result = z.object({ song: z.string().max(3) }).safeParse({ song: "demasiado largo" });

    const error = wire(result.error);

    expect(error.code).toBe("BAD_REQUEST");
    expect(error.data).toStrictEqual({ issues: result.error?.issues });
  });

  test("errors that are already wire errors, and aborts, pass through untouched", () => {
    const existing = new ORPCError("UNAUTHORIZED");
    const abort = new DOMException("The operation was aborted.", "AbortError");

    expect(wire(existing)).toBe(existing);
    expect(toWireError(abort, scope)).toBe(abort);
  });

  test("a crash is reported once and leaves as a sanitized error with the event id", () => {
    vi.mocked(Sentry.captureException).mockClear();
    const crash = new TypeError("Cannot read properties of undefined (reading 'id')");

    const error = wire(crash);

    expect(Sentry.captureException).toHaveBeenCalledWith(crash, { tags: { procedure: "tracks.create" } });
    expect([error.code, error.message, error.data]).toStrictEqual([
      "INTERNAL_SERVER_ERROR",
      "Algo salió mal de nuestro lado. Ya nos llegó el aviso.",
      { eventId: "event-1" },
    ]);
  });
});
