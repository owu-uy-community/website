import { ORPCError } from "@orpc/server";

/**
 * Postgres codes that mean the database is behind the schema in the repo.
 * There is no migrations dir here: the schema reaches a database only when
 * somebody runs `pnpm db:push` against it, so deploying a new table or column
 * 500s until they do. Say that out loud — the person reading the toast is
 * usually the one who has to run it.
 */
const SCHEMA_BEHIND: Record<string, string> = {
  "42P01": "falta una tabla",
  "42703": "falta una columna",
};

/**
 * drizzle wraps the driver error ("Failed query: select …"), so the pg code
 * rides on `cause`. Returning that inner error matters: its message names the
 * missing relation, while the wrapper's message starts with the whole query.
 */
const schemaBehind = (error: unknown) => {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const { code } = current as { code?: unknown };

    if (typeof code === "string" && SCHEMA_BEHIND[code]) return { code, message: current.message };
  }

  return null;
};

/**
 * Enhanced error handler for oRPC procedures
 */
export const handleServiceError = (error: unknown, operation: string): never => {
  // An ORPCError already carries the status and a message meant for the caller.
  // Re-wrapping it as a plain Error downgrades it to a 500 with oRPC's generic
  // "Internal server error", which is how domain errors ("that user has never
  // signed in") reached the UI as a server crash.
  if (error instanceof ORPCError) {
    throw error;
  }

  console.error(`❌ Failed to ${operation}:`);
  console.error('Error object:', error);
  console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');

  // Same reason: a plain Error here would reach the operator as "Internal
  // server error" with the actual cause left behind in the server log.
  const behind = schemaBehind(error);

  if (behind) {
    // `relation "owy_stage_state" does not exist` — the name is worth showing:
    // it is what you grep for, and the schema is public.
    const relation = behind.message.match(/"([a-z0-9_]+)"/i)?.[1];

    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: `La base de datos de este entorno está atrasada: ${SCHEMA_BEHIND[behind.code]}${
        relation ? ` (${relation})` : ""
      }. Hay que correr "pnpm db:push" con el DATABASE_URL de este deploy.`,
    });
  }

  if (error instanceof Error) {
    throw new Error(error.message);
  }

  throw new Error(`Failed to ${operation}`);
};

/**
 * Async error handler wrapper for service calls
 */
export const withErrorHandling = <T extends any[], R>(serviceMethod: (...args: T) => Promise<R>, operation: string) => {
  return async (...args: T): Promise<R> => {
    try {
      return await serviceMethod(...args);
    } catch (error) {
      return handleServiceError(error, operation);
    }
  };
};
