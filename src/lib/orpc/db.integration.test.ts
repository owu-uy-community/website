import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { Effect, Exit } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { communities } from "lib/db/schema";

import { query, transaction } from "./db";
import { Conflict } from "./errors";
import { liveServices } from "./services";

const run = Effect.runPromiseExitWith(liveServices);

const insertCommunity = (slug: string) =>
  query((database) => database.insert(communities).values({ slug, name: slug }).returning());

const exists = async (slug: string) =>
  (await db.select().from(communities).where(eq(communities.slug, slug))).length === 1;

describe(transaction, () => {
  test("a failure rolls back every write made before it, and the typed error comes out", async () => {
    const slug = `tx-${createId().slice(0, 8)}`;
    const failure = new Conflict({ reason: "test", message: "Abortado" });

    const exit = await run(
      transaction(
        Effect.gen(function* () {
          yield* insertCommunity(slug);
          return yield* failure;
        })
      )
    );

    expect(exit).toStrictEqual(Exit.fail(failure));
    await expect(exists(slug)).resolves.toBe(false);
  });

  test("a nested transaction that fails rolls back only its own writes", async () => {
    const [outer, inner] = [`out-${createId().slice(0, 8)}`, `in-${createId().slice(0, 8)}`];

    await run(
      transaction(
        Effect.gen(function* () {
          yield* insertCommunity(outer);
          yield* transaction(
            Effect.gen(function* () {
              yield* insertCommunity(inner);
              return yield* new Conflict({ reason: "test", message: "Solo adentro" });
            })
          ).pipe(Effect.catchTag("Conflict", () => Effect.void));
        })
      )
    );

    expect([await exists(outer), await exists(inner)]).toStrictEqual([true, false]);
  });
});

describe(query, () => {
  test("a unique violation is a typed failure naming the constraint", async () => {
    const slug = `dup-${createId().slice(0, 8)}`;
    await run(insertCommunity(slug));

    const exit = await run(insertCommunity(slug));

    expect(Exit.isFailure(exit) && exit.cause.toString()).toContain("communities_slug_unique");
  });
});
