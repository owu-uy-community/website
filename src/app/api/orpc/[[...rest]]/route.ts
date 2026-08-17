import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { router } from "../../../../lib/orpc/router";
import { auth } from "../../../lib/auth";

const handler = new RPCHandler(router, {
  plugins: [new BatchHandlerPlugin()],
});

/**
 * Session from better-auth. Browsers send cookies; machine callers (the Owy
 * bot, see /owy) send an `x-api-key` header and the apiKey plugin resolves it
 * to a session for the key's owner — same context either way.
 *
 * A rejected key (unknown, disabled, expired, rate-limited) throws here; treat
 * it as "no session" so the procedure's own auth returns 401/403 instead of a
 * 500.
 */
async function resolveSession(request: Request) {
  try {
    return await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    console.warn("[auth] Could not resolve a session for this request:", error);
    return null;
  }
}

async function handleRequest(request: Request) {
  const session = await resolveSession(request);

  const { response } = await handler.handle(request, {
    prefix: "/api/orpc",
    context: {
      session,
      user: session?.user,
    },
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
