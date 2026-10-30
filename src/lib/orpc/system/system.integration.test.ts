import { call } from "@orpc/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeMember, makeSiteAdmin } from "test/factories";

const SECRETS = {
  TELEGRAM_BOT_TOKEN: "telegram-secret-token",
  OWY_ANNOUNCE_TELEGRAM_CHAT_ID: "-100424242",
  AI_GATEWAY_API_KEY: "gateway-secret-key",
  REDIS_URL: "redis://default:redis-secret@redis.test:6379",
};

/** Everything the answer depends on, so the machine running the tests can't leak into it. */
function stubEnv(values: Record<string, string>) {
  for (const name of [
    "TELEGRAM_BOT_TOKEN",
    "OWY_ANNOUNCE_TELEGRAM_CHAT_ID",
    "OWY_SLACK_BOT_TOKEN",
    "OWY_ANNOUNCE_SLACK_CHANNEL_ID",
    "AI_GATEWAY_API_KEY",
    "VERCEL_OIDC_TOKEN",
    "EVENTBRITE_API_KEY",
    "EVENTBRITE_WEBHOOK_SECRET",
    "REDIS_URL",
    "KV_URL",
    "REALTIME_SIDECAR_URL",
    "VERCEL_GIT_COMMIT_SHA",
    "VERCEL_ENV",
  ]) {
    vi.stubEnv(name, values[name] ?? "");
  }
}

describe("system.integrations", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("site staff sees which integrations are set up, and never their values", async () => {
    stubEnv({ ...SECRETS, VERCEL_GIT_COMMIT_SHA: "a1b2c3d4e5f6", VERCEL_ENV: "preview" });
    const staff = await makeSiteAdmin();

    const result = await call(router.system.integrations, undefined, by(staff));

    expect(result).toStrictEqual({
      owy: { telegram: true, slack: false, staffDm: false },
      ai: { configured: true },
      eventbrite: { apiKey: false, webhookSecret: false },
      realtime: { redis: true, sidecar: false },
      version: { commit: "a1b2c3d4e5f6", environment: "preview" },
    });
    const wire = JSON.stringify(result);
    for (const secret of Object.values(SECRETS)) expect(wire).not.toContain(secret);
  });

  test("the AI Gateway counts as set up with the deployment's OIDC token alone", async () => {
    stubEnv({ VERCEL_OIDC_TOKEN: "oidc-token" });
    const staff = await makeSiteAdmin();

    const result = await call(router.system.integrations, undefined, by(staff));

    expect(result.ai.configured).toBe(true);
    expect(result.version).toStrictEqual({ commit: null, environment: "local" });
  });

  test("only site staff may ask: not even a community owner", async () => {
    stubEnv(SECRETS);
    const owner = await makeMember((await makeCommunity()).id, "owner");

    await expect(call(router.system.integrations, undefined, by(owner))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.system.integrations, undefined, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
