import { ORPCError } from "@orpc/server";
import * as Sentry from "@sentry/nextjs";
import { Data } from "effect";
import * as z from "zod";

/**
 * Errors, in two layers.
 *
 * Services fail with the tagged errors below. They know nothing about HTTP or
 * oRPC, so a service can be called from a procedure, a script or a test alike.
 *
 * `toWireError` is the single place that turns anything thrown under a
 * procedure into what the client sees: a typed error from `APP_ERRORS`
 * (declared on every procedure, so `isDefinedError` narrows `data`) or, for a
 * crash, a sanitized INTERNAL_SERVER_ERROR carrying the Sentry event id.
 */

// ---------------------------------------------------------------------------
// Service errors
// ---------------------------------------------------------------------------

/** A row the request points at does not exist (or is outside the caller's event). */
export class NotFound extends Data.TaggedError("NotFound")<{ entity: string; message: string }> {}

/** The request collides with the current state: a taken slot, a duplicate name, the last owner. */
export class Conflict extends Data.TaggedError("Conflict")<{
  reason: string;
  message: string;
  occupiedBy?: string;
}> {}

/** The request is well-formed but asks for something that makes no sense; `issues` say what, field by field. */
export class Invalid extends Data.TaggedError("Invalid")<{ message: string; issues?: readonly unknown[] }> {}

/** Authenticated, but not allowed to do this particular thing. */
export class Forbidden extends Data.TaggedError("Forbidden")<{ message: string }> {}

/** A service we depend on (Eventbrite, the AI Gateway, Spotify…) failed or timed out. */
export class UpstreamFailed extends Data.TaggedError("UpstreamFailed")<{
  service: string;
  message: string;
  cause?: unknown;
}> {}

/** A write hit a unique index. Services catch it to say *what* collided; unhandled it is a CONFLICT. */
export class UniqueViolation extends Data.TaggedError("UniqueViolation")<{ constraint: string; cause: unknown }> {}

/** A write referenced a row that does not exist. Unhandled it is a BAD_REQUEST. */
export class ForeignKeyViolation extends Data.TaggedError("ForeignKeyViolation")<{
  constraint: string;
  cause: unknown;
}> {}

type DomainError = NotFound | Conflict | Invalid | Forbidden | UpstreamFailed | UniqueViolation | ForeignKeyViolation;

// ---------------------------------------------------------------------------
// Wire errors (what clients can rely on)
// ---------------------------------------------------------------------------

/** Declared on every procedure via the base builder. */
export const APP_ERRORS = {
  BAD_REQUEST: { data: z.object({ issues: z.array(z.unknown()).optional() }).optional() },
  UNAUTHORIZED: {},
  FORBIDDEN: {},
  NOT_FOUND: { data: z.object({ entity: z.string() }).optional() },
  CONFLICT: { data: z.object({ reason: z.string(), occupiedBy: z.string().optional() }).optional() },
  /** Thrown by the rate limit middleware; `reset` is when the window starts over (epoch ms). */
  TOO_MANY_REQUESTS: {
    data: z
      .object({ limit: z.number().optional(), remaining: z.number().optional(), reset: z.number().optional() })
      .optional(),
  },
  BAD_GATEWAY: { data: z.object({ service: z.string() }).optional() },
  INTERNAL_SERVER_ERROR: { data: z.object({ eventId: z.string().optional() }).optional() },
};

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";
const PG_BAD_INPUT = new Set(["23502", "23514", "22P02", "22007", "22008"]);

type PgError = { code: string; constraint?: string };

function isPgError(error: unknown): error is PgError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    /^[0-9A-Z]{5}$/.test((error as { code: string }).code) &&
    "severity" in error
  );
}

/** The Postgres error behind a Drizzle error, if there is one. */
export function pgErrorOf(error: unknown): PgError | null {
  if (isPgError(error)) return error;
  const cause = typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined;

  return cause === undefined || cause === error ? null : pgErrorOf(cause);
}

function fromDomainError(error: DomainError): ORPCError<string, unknown> {
  switch (error._tag) {
    case "NotFound":
      return new ORPCError("NOT_FOUND", { message: error.message, data: { entity: error.entity } });
    case "Conflict":
      return new ORPCError("CONFLICT", {
        message: error.message,
        data: { reason: error.reason, ...(error.occupiedBy === undefined ? {} : { occupiedBy: error.occupiedBy }) },
      });
    case "Invalid":
      return new ORPCError("BAD_REQUEST", {
        message: error.message,
        ...(error.issues ? { data: { issues: [...error.issues] } } : {}),
      });
    case "Forbidden":
      return new ORPCError("FORBIDDEN", { message: error.message });
    case "UpstreamFailed":
      return new ORPCError("BAD_GATEWAY", { message: error.message, data: { service: error.service } });
    case "UniqueViolation":
      return new ORPCError("CONFLICT", { message: "Ya existe un registro igual", data: { reason: error.constraint } });
    case "ForeignKeyViolation":
      return new ORPCError("BAD_REQUEST", { message: "El pedido apunta a algo que no existe" });
  }
}

const DOMAIN_TAGS = new Set([
  "NotFound",
  "Conflict",
  "Invalid",
  "Forbidden",
  "UpstreamFailed",
  "UniqueViolation",
  "ForeignKeyViolation",
]);

function isDomainError(error: unknown): error is DomainError {
  return typeof error === "object" && error !== null && DOMAIN_TAGS.has(String((error as { _tag?: unknown })._tag));
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/**
 * Turn whatever a procedure threw into the error the client receives.
 * Expected errors pass through untouched; a crash is reported to Sentry once
 * and replaced by an INTERNAL_SERVER_ERROR that leaks nothing but the event id.
 */
export function toWireError(error: unknown, scope: { path: readonly string[]; userId?: string }): unknown {
  if (error instanceof ORPCError) return error;
  if (isDomainError(error)) return fromDomainError(error);
  if (error instanceof z.ZodError) {
    return new ORPCError("BAD_REQUEST", { message: "Datos inválidos", data: { issues: error.issues } });
  }
  if (isAbort(error)) return error;

  const pg = pgErrorOf(error);
  if (pg?.code === PG_UNIQUE_VIOLATION) {
    return new ORPCError("CONFLICT", {
      message: "Ya existe un registro igual",
      data: { reason: pg.constraint ?? "duplicate" },
    });
  }
  if (pg?.code === PG_FOREIGN_KEY_VIOLATION) {
    return new ORPCError("BAD_REQUEST", { message: "El pedido apunta a algo que no existe" });
  }
  if (pg && PG_BAD_INPUT.has(pg.code)) {
    return new ORPCError("BAD_REQUEST", { message: "Datos inválidos" });
  }

  const eventId = Sentry.captureException(error, {
    tags: { procedure: scope.path.join(".") },
    ...(scope.userId ? { user: { id: scope.userId } } : {}),
  });

  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Algo salió mal de nuestro lado. Ya nos llegó el aviso.",
    data: { eventId },
    cause: error,
  });
}
