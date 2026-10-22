import { drainSoon } from "lib/email/outbox";
import { later } from "lib/later";
import { announceSoon } from "lib/orpc/events/service";
import { pushSoon } from "lib/orpc/integrations/service";
import { requestContext, rpcHandler } from "lib/orpc/handlers";

/**
 * The RPC endpoint for the site itself, the Owy bot and scripts. Browsers send
 * their session cookie; machine callers send `x-api-key`, which Better Auth's
 * apiKey plugin turns into a session for the key's owner — same context
 * either way. Only POST is accepted (oRPC v2's default), so a link can never
 * trigger a procedure.
 */
async function handle(request: Request) {
  const { matched, response } = await rpcHandler.handle(request, {
    prefix: "/api/orpc",
    context: () => requestContext(request.headers),
  });

  // Email a procedure queued goes out right after the response, not at the next tick; so do an
  // event published to Eventbrite and Owy's announcement of it
  later(drainSoon);
  later(pushSoon);
  later(announceSoon);

  return matched ? response : new Response("Not found", { status: 404 });
}

export const POST = handle;
