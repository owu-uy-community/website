import { createId } from "@paralleldrive/cuid2";
import type { InferRouterInputs } from "@orpc/server";
import { Context } from "effect";

import type { Session } from "app/lib/auth";
import type { BaseContext } from "lib/orpc/base";
import type { router } from "lib/orpc/router";
import { Ai, liveServices, Realtime } from "lib/orpc/services";

import type { UserRow } from "./factories";

type Overrides = {
  /** Replace the AI model resolver, e.g. `{ model: () => new MockLanguageModelV3(…) }`. */
  ai?: Context.Service.Shape<typeof Ai>;
  realtime?: Context.Service.Shape<typeof Realtime>;
  /** Simulate an API-key caller (the Owy bot) instead of a browser session. */
  apiKey?: boolean;
};

/**
 * Call options for a procedure invoked as `actor`:
 * `call(router.tracks.create, input, by(admin))`. `by(null)` is an anonymous
 * caller. This is the only place that knows the shape of the oRPC context.
 */
export function by(actor: UserRow | null, overrides: Overrides = {}): { context: BaseContext } {
  const now = new Date();
  const session = actor
    ? ({
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
      } as Session)
    : null;

  let services = liveServices;
  if (overrides.ai) services = Context.add(services, Ai, overrides.ai);
  if (overrides.realtime) services = Context.add(services, Realtime, overrides.realtime);

  return {
    context: {
      getSession: async () => session,
      ...(overrides.apiKey ? { requestHeaders: new Headers({ "x-api-key": "test" }) } : {}),
      "effect/context": services,
    },
  };
}

/** Input type of any procedure: `RouterInputs["tracks"]["create"]`. */
export type RouterInputs = InferRouterInputs<typeof router>;
