import "server-only";

import { createRouterClient, ORPCError } from "@orpc/server";
import { headers } from "next/headers";
import { cache } from "react";

import { requestContext } from "./handlers";
import { router } from "./router";

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

/** For pages that 404 on a missing row: NOT_FOUND becomes `null`, anything else still throws. */
export async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}
