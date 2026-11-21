import { Effect } from "effect";

import { owyChannels } from "../../owy/messaging";
import type { Integrations } from "./schemas";

const isSet = (name: string) => Boolean(process.env[name]);

const ENVIRONMENTS = new Set(["production", "preview", "development"]);

/**
 * Read at call time, so the answer follows the deployment's environment. On Vercel the AI
 * Gateway authenticates with the OIDC token, which a function gets on each request.
 */
export const integrations = (headers?: Headers) =>
  Effect.sync((): Integrations => ({
    owy: owyChannels(),
    ai: {
      configured:
        isSet("AI_GATEWAY_API_KEY") || isSet("VERCEL_OIDC_TOKEN") || Boolean(headers?.get("x-vercel-oidc-token")),
    },
    eventbrite: { apiKey: isSet("EVENTBRITE_API_KEY"), webhookSecret: isSet("EVENTBRITE_WEBHOOK_SECRET") },
    realtime: {
      redis: isSet("REDIS_URL") || isSet("KV_URL"),
      sidecar: isSet("REALTIME_SIDECAR_URL") || process.env.NODE_ENV === "development",
    },
    version: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      environment: ENVIRONMENTS.has(process.env.VERCEL_ENV ?? "")
        ? (process.env.VERCEL_ENV as "production" | "preview" | "development")
        : "local",
    },
  }));
