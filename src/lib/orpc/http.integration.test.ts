import { createORPCClient, isDefinedError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { POST as rpc } from "app/api/orpc/[[...rest]]/route";
import { GET as epg } from "app/api/openspace/epg/route";
import { GET as restGet, POST as restPost } from "app/api/v1/[[...rest]]/route";
import { auth } from "app/lib/auth";
import type { AppRouter } from "lib/orpc/router";
import { aiLive } from "lib/orpc/services";
import { generatingModel, models, streamingModel } from "test/ai";
import { makeBoard, makeMember, makeSiteAdmin, makeTrack } from "test/factories";
import { mintSession } from "test/session";

/**
 * The HTTP surface as its real callers use it — the site's client, the Owy
 * bot (API key), the now-playing script (raw JSON) and REST clients — driving
 * the actual route handlers in-process.
 */

const ORIGIN = "http://owu.test";

function rpcClient(headers: Record<string, string> = {}, batched = false): RouterClient<AppRouter> {
  return createORPCClient(
    new RPCLink({
      origin: ORIGIN,
      url: "/api/orpc",
      headers: () => headers,
      fetch: (url, init) => rpc(new Request(url, init)),
      plugins: batched ? [new BatchLinkPlugin({ groups: [{ condition: () => true, context: {} }] })] : [],
    })
  );
}

async function cookieFor(userId: string) {
  const { name, value } = await mintSession(userId);

  return { cookie: `${name}=${value}` };
}

const eventInput = (communityId: string) => ({
  communityId,
  name: "Por HTTP",
  startDate: "2026-11-07T17:30:00.000Z",
  endDate: "2026-11-07T23:30:00.000Z",
});

describe("/api/orpc", () => {
  test("anyone reads public procedures", async () => {
    const { community } = await makeBoard();

    await expect(rpcClient().communities.getBySlug({ communitySlug: community.slug })).resolves.toMatchObject({
      id: community.id,
    });
  });

  test("a staff cookie authorizes staff procedures; a member cookie is refused", async () => {
    const { community } = await makeBoard();
    const staff = await makeSiteAdmin();
    const member = await makeMember(community.id, "member");

    await expect(
      rpcClient(await cookieFor(staff.id)).openSpaces.create(eventInput(community.id))
    ).resolves.toMatchObject({ name: "Por HTTP", communityId: community.id });
    await expect(
      rpcClient(await cookieFor(member.id)).openSpaces.create(eventInput(community.id))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("an API key acts as its owner, and a key Better Auth rejects is just anonymous", async () => {
    const { community } = await makeBoard();
    const bot = await makeSiteAdmin({ name: "Owy" });
    const { key } = await auth.api.createApiKey({ body: { userId: bot.id, name: "test" } });

    await expect(rpcClient({ "x-api-key": key }).openSpaces.create(eventInput(community.id))).resolves.toMatchObject({
      communityId: community.id,
    });
    await expect(
      rpcClient({ "x-api-key": "owy_not-a-real-key" }).openSpaces.create(eventInput(community.id))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("typed errors survive the wire", async () => {
    const { event, rooms, slots } = await makeBoard();
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id }, { title: "Primera" });
    const staff = await makeSiteAdmin();

    const error = await rpcClient(await cookieFor(staff.id))
      .tracks.create({
        title: "Segunda",
        openSpaceId: event.id,
        scheduleId: slots.early.id,
        roomId: rooms.plain.id,
        needsTV: false,
        needsWhiteboard: false,
        skipResourceValidation: false,
      })
      .catch((caught: unknown) => caught);

    expect(isDefinedError(error)).toBe(true);
    expect(error).toMatchObject({ code: "CONFLICT" });
  });

  test("calls made together travel as one batch and each gets its own answer", async () => {
    const { community } = await makeBoard();
    const client = rpcClient({}, true);

    const [list, one] = await Promise.all([
      client.communities.list(),
      client.communities.getBySlug({ communitySlug: community.slug }),
    ]);

    expect(list.map((c) => c.id)).toContain(community.id);
    expect(one?.id).toBe(community.id);
  });

  test("the now-playing script's raw JSON body works", async () => {
    const bot = await makeSiteAdmin();
    const { key } = await auth.api.createApiKey({ body: { userId: bot.id, name: "now-playing" } });

    const response = await rpc(
      new Request(`${ORIGIN}/api/orpc/owyStage/nowPlaying`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key },
        body: JSON.stringify({ json: { song: "Movimiento", artist: "Drexler" } }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ json: { applied: false } });
  });

  test("a card photo streams its reading to the browser, typed errors included", async () => {
    const { event } = await makeBoard();
    const staff = await makeSiteAdmin();
    const client = rpcClient(await cookieFor(staff.id));
    vi.spyOn(aiLive, "model").mockImplementation(
      models({
        card: streamingModel([
          '{"transcripcion":"Ana","speaker":"Ana","title":"Ef',
          'fect","requisito":"ninguno","revisar":[]}',
        ]),
        pick: generatingModel({ candidato: "c0", razon: "Libre.", alternativas: [] }),
      }).model
    );

    const types: string[] = [];
    for await (const update of await client.ocr.extractCard({
      eventId: event.id,
      imageData: "data:image/jpeg;base64,/9j/",
    })) {
      types.push(update.type);
    }
    const missing = await client.ocr
      .extractCard({ eventId: "no-existe", imageData: "data:image/jpeg;base64,/9j/" })
      .then(async (updates) => {
        for await (const _ of updates);
      })
      .catch((caught: unknown) => caught);

    expect(types.at(-2)).toBe("card");
    expect(types.at(-1)).toBe("suggestion");
    expect(missing).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a GET never runs a procedure", async () => {
    const response = await rpc(new Request(`${ORIGIN}/api/orpc/communities/list`, { method: "GET" }));

    expect(response.status).toBe(404);
  });
});

describe("/api/openspace/epg", () => {
  test("lists an event's talks as programme entries in local time, in order", async () => {
    const { event, rooms, slots } = await makeBoard();
    await makeTrack({ eventId: event.id, scheduleId: slots.late.id, roomId: rooms.tv.id }, { title: "Tarde" });
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id }, { title: "Temprano" });

    const response = await epg(new Request(`${ORIGIN}/api/openspace/epg?eventId=${event.id}`));
    const entries = (await response.json()) as { since: string; till: string; title: string; location: string }[];

    expect(entries.map((entry) => [entry.title, entry.since, entry.till])).toStrictEqual([
      ["Temprano", "2026-11-07T15:00", "2026-11-07T15:45"],
      ["Tarde", "2026-11-07T16:00", "2026-11-07T16:45"],
    ]);
    expect(entries[1]?.location).toBe(rooms.tv.name.toUpperCase());
  });
});

describe("/api/v1", () => {
  test("procedures answer plain JSON", async () => {
    const { community } = await makeBoard();

    const response = await restPost(
      new Request(`${ORIGIN}/api/v1/communities/getBySlug`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ communitySlug: community.slug }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: community.id, slug: community.slug });
  });

  test("the docs and the spec exist only for site staff", async () => {
    const staff = await makeSiteAdmin();
    const staffHeaders = await cookieFor(staff.id);
    const get = (path: string, headers: Record<string, string> = {}) =>
      restGet(new Request(`${ORIGIN}/api/v1${path}`, { headers }));

    const [anonymousDocs, staffDocs, staffSpec] = await Promise.all([
      get("/docs"),
      get("/docs", staffHeaders),
      get("/spec.json", staffHeaders),
    ]);
    const spec = (await staffSpec.json()) as { paths: Record<string, unknown> };

    expect([anonymousDocs.status, staffDocs.status, staffSpec.status]).toStrictEqual([404, 200, 200]);
    expect(Object.keys(spec.paths)).toContain("/tracks/create");
  });
});
