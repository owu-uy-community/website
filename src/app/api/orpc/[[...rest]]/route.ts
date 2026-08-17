import { timingSafeEqual } from "node:crypto";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { router } from "../../../../lib/orpc/router";
import { auth, type Session } from "../../../lib/auth";

const handler = new RPCHandler(router, {
  plugins: [new BatchHandlerPlugin()],
});

/**
 * Service-account auth for the Owy bot (see /owy).
 * A request carrying the correct `x-owy-api-key` header gets a synthetic
 * admin context without a better-auth session. Constant-time comparison.
 */
function hasValidOwyKey(request: Request): boolean {
  const configured = process.env.OWY_API_KEY;
  const provided = request.headers.get("x-owy-api-key");
  if (!configured || !provided) return false;

  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function buildOwyServiceSession(): Session {
  const now = new Date();
  const user = {
    id: "owy-bot",
    name: "Owy",
    email: "owy@owu.uy",
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
    role: "admin",
    status: "active",
  };
  const session = {
    id: "owy-bot-service-session",
    userId: user.id,
    token: "owy-bot-service-token",
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: "owy-bot",
  };
  // Synthetic session shaped like better-auth's getSession result
  return { user, session } as unknown as Session;
}

async function handleRequest(request: Request) {
  // Get session from better-auth
  // Pass the full request object so better-auth can extract cookies properly
  const session = hasValidOwyKey(request)
    ? buildOwyServiceSession()
    : await auth.api.getSession({
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
