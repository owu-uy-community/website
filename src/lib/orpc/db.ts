import { Context, Effect, Exit } from "effect";

import type { Db } from "../db";
import { ForeignKeyViolation, pgErrorOf, UniqueViolation } from "./errors";
import { Database } from "./services";

/**
 * Run a Drizzle query against the current `Database` (the app database, or
 * the transaction this effect runs in). Unique and foreign-key violations
 * become typed failures a service can turn into a precise answer; anything
 * else the database throws is a defect — a crash, reported as such.
 */
export const query = <A>(
  run: (db: Db) => PromiseLike<A>
): Effect.Effect<A, UniqueViolation | ForeignKeyViolation, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;

    return yield* Effect.tryPromise({
      try: () => run(db),
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((cause): Effect.Effect<never, UniqueViolation | ForeignKeyViolation> => {
        const pg = pgErrorOf(cause);
        if (pg?.code === "23505") return Effect.fail(new UniqueViolation({ constraint: pg.constraint ?? "", cause }));
        if (pg?.code === "23503")
          return Effect.fail(new ForeignKeyViolation({ constraint: pg.constraint ?? "", cause }));

        return Effect.die(cause);
      })
    );
  });

class Rollback {
  constructor(readonly exit: Exit.Exit<unknown, unknown>) {}
}

/**
 * Run an effect inside one database transaction: every `query` it makes uses
 * the transaction, and a failure (typed or not) rolls everything back before
 * the error continues. Nested calls become savepoints.
 */
export const transaction = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const context = yield* Effect.context<R | Database>();
    const exit = yield* Effect.promise(
      (signal) =>
        db
          .transaction(async (tx) => {
            const result = await Effect.runPromiseExitWith(Context.add(context, Database, tx))(self, { signal });
            // Throwing is how Drizzle knows to roll back.
            if (Exit.isFailure(result)) throw new Rollback(result);

            return result;
          })
          .catch((error: unknown) => (error instanceof Rollback ? error.exit : Exit.die(error))) as Promise<
          Exit.Exit<A, E>
        >
    );

    return yield* exit;
  });
