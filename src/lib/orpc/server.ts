import "server-only";

import { createRouterClient } from "@orpc/server";
import { headers } from "next/headers";
import { cache } from "react";

import { requestContext } from "./handlers";
import { router } from "./router";
import { liveServices } from "./services";

/**
 * Procedures called from server components and route handlers, in-process:
 * the same auth, scoping and errors as over HTTP, without the HTTP. The
 * context (and its one session lookup) is shared by every call while a
 * request renders.
 */
export const caller = createRouterClient(router, {
  context: cache(async () => requestContext(await headers())),
});

/** The same for route handlers, which have the request's headers at hand. */
export const callerFor = (headers: Headers) => createRouterClient(router, { context: requestContext(headers) });

/**
 * An anonymous caller that never reads the request: for statically generated
 * (ISR) pages that only show public data. Asking for the session would make
 * them dynamic.
 */
export const publicCaller = createRouterClient(router, {
  context: { getSession: async () => null, "effect/context": liveServices },
});
