/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { headers } from "next/headers";
import { makeRouteHandler } from "@keystatic/next/route-handler";

import { auth } from "app/lib/auth";

import keystaticConfig from "../../../../../keystatic.config";

const handlers = makeRouteHandler({
  config: keystaticConfig,
});

// Same policy as the /keystatic UI: dev-only (local-filesystem storage) and admin-only.
async function rejectUnauthorized(): Promise<Response | null> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });

  // @ts-expect-error - role is defined in auth config additionalFields,
  // better-auth type definitions are broken for this use case
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

export async function GET(...args: Parameters<typeof handlers.GET>) {
  const rejection = await rejectUnauthorized();
  if (rejection) return rejection;

  return handlers.GET(...args);
}

export async function POST(...args: Parameters<typeof handlers.POST>) {
  const rejection = await rejectUnauthorized();
  if (rejection) return rejection;

  return handlers.POST(...args);
}
