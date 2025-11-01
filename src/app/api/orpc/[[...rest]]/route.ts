import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { router } from "../../../../lib/orpc/router";
import { auth } from "../../../lib/auth";

const handler = new RPCHandler(router, {
  plugins: [new BatchHandlerPlugin()],
});

async function handleRequest(request: Request) {
  // Get session from better-auth
  // Pass the full request object so better-auth can extract cookies properly
  const session = await auth.api.getSession({
    headers: request.headers,
  });

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
