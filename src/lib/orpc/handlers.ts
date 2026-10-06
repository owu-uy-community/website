import { EvlogHandlerPlugin } from "@orpc/evlog";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";

import { auth, type Session } from "app/lib/auth";

import { evlogOptions } from "../evlog";
import type { BaseContext } from "./base";
import { router } from "./router";
import { liveServices } from "./services";

/**
 * The initial context of one request. The session lookup runs at most once,
 * and only if a procedure asks for it. An API key Better Auth rejects
 * (unknown, disabled, rate-limited) makes it throw; that is "no session", so
 * the procedure answers 401/403 instead of crashing.
 */
export function requestContext(headers: Headers): BaseContext {
  let session: Promise<Session | null> | undefined;

  return {
    getSession: () => (session ??= auth.api.getSession({ headers }).catch(() => null)),
    requestHeaders: headers,
    "effect/context": liveServices,
  };
}

/** `/api/orpc`: the RPC protocol the site, the Owy bot and scripts speak. */
export const rpcHandler = new RPCHandler(router, {
  plugins: [new BatchHandlerPlugin(), new EvlogHandlerPlugin(evlogOptions)],
});

const generator = new OpenAPIGenerator({ converters: [new ZodToJsonSchemaConverter()] });

/**
 * `/api/v1`: the same procedures as plain HTTP + JSON, with Scalar docs at
 * `/api/v1/docs`. The docs and spec are for site staff only — for everyone
 * else they do not exist.
 */
export const openApiHandler = new OpenAPIHandler(router, {
  plugins: [
    new EvlogHandlerPlugin(evlogOptions),
    new OpenAPIReferenceHandlerPlugin({
      docsPath: "/docs",
      docsTitle: "OWU API",
      allow: async ({ context }) => (await context.getSession())?.user.role === "admin",
      spec: () =>
        generator.generate(router, {
          base: {
            info: {
              title: "OWU API",
              version: "1.0.0",
              description:
                "Open spaces, staff coordination and the event-day rig (OBS, the stage wall). Every call needs " +
                "a session cookie or an `x-api-key` header, except the public reads.",
            },
            servers: [{ url: "/api/v1" }],
          },
        }),
    }),
  ],
});
