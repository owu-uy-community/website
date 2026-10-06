import { createId } from "@paralleldrive/cuid2";
import type { InferRouterInputs } from "@orpc/server";

import type { Context } from "lib/orpc/middleware";
import type { router } from "lib/orpc/router";

import type { UserRow } from "./factories";

/**
 * Call options for a procedure invoked as `actor`:
 * `call(router.tracks.create, input, by(admin))`. `by(null)` is an anonymous
 * caller. This is the only place that knows the shape of the oRPC context.
 */
export function by(actor: UserRow | null): { context: Context } {
  if (!actor) return { context: { session: null, user: null } };

  const now = new Date();
  const session = {
    session: {
      id: createId(),
      token: createId(),
      userId: actor.id,
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: actor,
  };

  return { context: { session: session as unknown as Context["session"], user: actor as unknown as Context["user"] } };
}

/** Input type of any procedure: `RouterInputs["tracks"]["create"]`. */
export type RouterInputs = InferRouterInputs<typeof router>;
