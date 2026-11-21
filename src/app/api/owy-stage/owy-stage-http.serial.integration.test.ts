import { call } from "@orpc/server";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { GET, POST } from "app/api/owy-stage/[...path]/route";
import { db } from "lib/db";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeSiteAdmin, makeServiceAccount } from "test/factories";
import { KEY_PRESETS, mintServiceKey } from "lib/authz/keys";
import { mintSession } from "test/session";

/** A Stream Deck (Companion's Generic HTTP module) firing the desk's presets, as it calls /api/owy-stage. */

async function setup() {
  await db.execute(sql`TRUNCATE owy_stage_state, owy_stage_inputs CASCADE`);
  const staff = await makeSiteAdmin();
  const presets = [
    { id: "a", name: "", scene: "logo" as const, params: {} },
    { id: "b", name: "Volvemos", scene: "message" as const, params: { title: "Volvemos" } },
  ];
  await call(router.owyStage.saveDesk, { desk: { presets } }, by(staff));
  const { name, value } = await mintSession(staff.id);

  return { staff, session: { cookie: `${name}=${value}` } };
}

async function stage(method: "GET" | "HEAD" | "POST", path: string, headers: Record<string, string> = {}) {
  // Next answers HEAD with the GET handler.
  const response = await (method === "POST" ? POST : GET)(
    new Request(`http://owu.test/api/owy-stage/${path}`, { method, headers }),
    { params: Promise.resolve({ path: path.split("/") }) }
  );

  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("/api/owy-stage", () => {
  test("a link can't fire a preset through someone's session; POST and API keys can", async () => {
    const { staff, session } = await setup();
    // A Stream Deck: its own service account and a key that only fires presets and drives OBS
    const deck = await makeServiceAccount({ id: `deck-${Date.now()}`, name: staff.name });
    const { key } = await mintServiceKey({
      ownerId: deck.id,
      name: "deck",
      permissions: KEY_PRESETS["stream-deck"],
      expiresInDays: 1,
      createdById: null,
    });

    const viaLink = await stage("GET", "preset/2", session);
    const viaHead = await stage("HEAD", "preset/2", session);
    const viaPost = await stage("POST", "preset/2", session);
    const viaKey = await stage("GET", "preset/a/air", { "x-api-key": key });

    expect([viaLink.status, viaHead.status]).toStrictEqual([405, 405]);
    expect(viaPost).toStrictEqual({
      status: 200,
      body: { ok: true, to: "preview", preset: { id: "b", name: "Volvemos", scene: "message" } },
    });
    // A preset without a name answers with its scene's title, as the desk shows it.
    expect(viaKey).toMatchObject({ status: 200, body: { to: "air", preset: { id: "a", name: "Logo OWU CONF" } } });
    await expect(call(router.owyStage.getDesk, undefined, by(staff))).resolves.toMatchObject({
      preview: { scene: "message", params: { title: "Volvemos" }, preset: "b" },
    });
    await expect(call(router.owyStage.getState, undefined, by(null))).resolves.toMatchObject({ scene: "logo" });
  });

  test("an unknown preset or command says so, and nobody signed out fires anything", async () => {
    const { session } = await setup();

    await expect(stage("POST", "preset/9", session)).resolves.toMatchObject({
      status: 404,
      body: { code: "NOT_FOUND" },
    });
    await expect(stage("POST", "preset/2/now", session)).resolves.toMatchObject({ status: 404 });
    await expect(stage("POST", "take", session)).resolves.toMatchObject({ status: 404 });
    await expect(stage("POST", "preset/1")).resolves.toMatchObject({ status: 401, body: { code: "UNAUTHORIZED" } });
  });
});
