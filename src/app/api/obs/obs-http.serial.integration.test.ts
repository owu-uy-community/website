import { call } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { GET, POST } from "app/api/obs/[...path]/route";
import { auth } from "app/lib/auth";
import { db } from "lib/db";
import { obsCommands } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeSiteAdmin, makeUser } from "test/factories";
import { mintSession } from "test/session";

/** Companion / Stream Deck and the executor tab, as they call /api/obs. */

async function setup() {
  await db.execute(
    sql`TRUNCATE obs_preset_items, obs_presets, obs_queue_items, obs_commands, obs_cues, obs_instances CASCADE`
  );
  const staff = await makeSiteAdmin({ name: "Mesa" });

  return { staff, session: await cookieFor(staff.id) };
}

async function cookieFor(userId: string) {
  const { name, value } = await mintSession(userId);

  return { cookie: `${name}=${value}` };
}

async function obs(method: "GET" | "POST", path: string, headers: Record<string, string> = {}) {
  const [route] = path.split("?");
  const response = await (method === "GET" ? GET : POST)(
    new Request(`http://owu.test/api/obs/${path}`, { method, headers }),
    { params: Promise.resolve({ path: route.split("/") }) }
  );

  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const commandsOn = (instanceId: number) =>
  db
    .select({ type: obsCommands.type, source: obsCommands.source })
    .from(obsCommands)
    .where(eq(obsCommands.instanceId, instanceId));

describe("/api/obs", () => {
  test("#7 a link can't fire a command through someone's session; POST and API keys can", async () => {
    const { staff, session } = await setup();
    const { key } = await auth.api.createApiKey({ body: { userId: staff.id, name: "deck" } });

    const viaLink = await obs("GET", "take", session);
    const viaPost = await obs("POST", "take", session);
    const viaKey = await obs("GET", "cut?instance=2", { "x-api-key": key });

    expect(viaLink.status).toBe(405);
    // Queued, but nobody executes yet: 409 lets a Companion button turn red.
    expect([viaPost.status, viaPost.body.executorOnline]).toStrictEqual([409, false]);
    expect(viaKey.status).toBe(409);
    await expect(commandsOn(1)).resolves.toStrictEqual([{ type: "take", source: "admin:Mesa" }]);
    await expect(commandsOn(2)).resolves.toStrictEqual([{ type: "cut", source: "api-key:Mesa" }]);
  });

  test("status is a plain GET with the rundown for button feedback", async () => {
    const { staff, session } = await setup();
    const cue = await call(router.obsCue.create, { instanceId: 1, name: "Apertura" }, by(staff));
    await call(router.obsCue.fire, { id: cue.id }, by(staff));

    const { status, body } = await obs("GET", "status", session);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      executorOnline: false,
      currentCue: { id: cue.id, name: "Apertura" },
      cues: [{ id: cue.id, name: "Apertura", active: true }],
    });
  });

  test("nobody signed in, or not staff, gets a JSON refusal", async () => {
    await setup();
    const user = await makeUser();

    await expect(obs("GET", "status")).resolves.toMatchObject({ status: 401, body: { code: "UNAUTHORIZED" } });
    await expect(obs("POST", "take", await cookieFor(user.id))).resolves.toMatchObject({
      status: 403,
      body: { code: "FORBIDDEN" },
    });
  });

  test("an unknown cue, an unknown command and a command missing its argument are JSON errors", async () => {
    const { session } = await setup();

    await expect(obs("POST", "cue/no-existe", session)).resolves.toMatchObject({
      status: 404,
      body: { ok: false, code: "NOT_FOUND" },
    });
    await expect(obs("POST", "nope", session)).resolves.toMatchObject({ status: 404, body: { ok: false } });
    await expect(obs("POST", "studio/maybe", session)).resolves.toMatchObject({ status: 400, body: { ok: false } });
  });

  test("loop buttons step the scene loop", async () => {
    const { staff, session } = await setup();
    await call(
      router.obsQueue.updateState,
      {
        instanceId: 1,
        data: {
          queueItems: ["A", "B"].map((sceneName, position) => ({ id: sceneName, sceneName, delay: 5, position })),
        },
      },
      by(staff)
    );

    await expect(obs("POST", "loop/next", session)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, currentItemIndex: 1 },
    });
    await expect(obs("POST", "loop/sideways", session)).resolves.toMatchObject({ status: 400 });
  });
});
