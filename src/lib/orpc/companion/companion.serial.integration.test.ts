import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { call, type RouterClient } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { POST as rpc } from "app/api/orpc/[[...rest]]/route";
import { KEY_PRESETS, mintServiceKey } from "lib/authz/keys";
import { db } from "lib/db";
import { auditLog, companionSettings } from "lib/db/schema";
import { router, type AppRouter } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by, type RouterInputs } from "test/context";
import { makeServiceAccount, makeSiteAdmin } from "test/factories";

type Report = RouterInputs["companion"]["report"];
type Change = RouterInputs["companion"]["set"]["changes"][number];

const KNOB = "owy-knob";

/** What a bridge with one knob reports. */
const status = (): Report["status"] => ({
  version: "033888a7",
  startedAt: new Date().toISOString(),
  machine: "owu-mac",
  values: { brain: "eve" },
  pending: [],
  rejected: [],
  devices: [
    {
      id: KNOB,
      host: "192.168.1.40",
      connected: true,
      peer: false,
      staff: false,
      voice: { tier: null, realtime: "disconnected", lastPath: null },
      turns: [],
      values: { brightness: 40 },
      held: ["talk"],
    },
  ],
});

/** The table is one global set of rows, so every test starts with none. */
async function setup() {
  await db.execute(sql`TRUNCATE companion_settings`);
  const staff = await makeSiteAdmin({ name: "Ana" });
  const publish = vi.spyOn(hub, "publish");
  const set = (...changes: Change[]) => call(router.companion.set, { changes }, by(staff));
  const report = (input: Partial<Report> = {}) =>
    call(router.companion.report, { status: status(), ...input }, by(staff));
  const state = () => call(router.companion.state, undefined, by(staff));
  const sent = (event: string) =>
    publish.mock.calls
      .filter(([channel, ev]) => channel === "private:companion" && ev === event)
      .map((args) => args[2]);

  return { staff, set, report, state, sent };
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const valueOf = (rows: { target: string; key: string; value: unknown }[], target: string, key: string) =>
  rows.find((row) => row.target === target && row.key === key)?.value;

describe("the companion's settings", () => {
  test("the panel's changes are stored, audited and broadcast; the same value again is not news", async () => {
    const { staff, set, state, sent } = await setup();

    const first = await set(
      { target: KNOB, key: "brightness", value: 40 },
      { target: "bridge", key: "brain", value: "local" }
    );
    const again = await set({ target: KNOB, key: "brightness", value: 40 });

    expect(first.rows).toStrictEqual([
      { target: KNOB, key: "brightness", value: 40, setBy: "admin:Ana", setAt: expect.any(String) },
      { target: "bridge", key: "brain", value: "local", setBy: "admin:Ana", setAt: expect.any(String) },
    ]);
    expect(again.rows).toStrictEqual([first.rows[0]]);
    expect(sent("rows")).toStrictEqual([{ rows: first.rows }]);
    await expect(state()).resolves.toMatchObject({
      rows: expect.arrayContaining(first.rows),
      status: null,
      seenAt: null,
    });
    const audits = await db
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.actorId, staff.id), eq(auditLog.action, "companion.settings")));
    expect(audits).toStrictEqual([
      {
        data: {
          changes: [
            { target: KNOB, setting: "brightness", before: null, after: 40 },
            { target: "bridge", setting: "brain", before: null, after: "local" },
          ],
        },
      },
    ]);
  });

  test("a setting cleared on purpose is stored as null, and set and cleared again", async () => {
    const { set, state } = await setup();

    await set({ target: "bridge", key: "host_mic", value: "  " });
    const cleared = valueOf((await state()).rows, "bridge", "host_mic");
    await set({ target: "bridge", key: "host_mic", value: "Wireless Microphone RX" });
    const named = valueOf((await state()).rows, "bridge", "host_mic");
    await set({ target: "bridge", key: "host_mic", value: null });

    expect([cleared, named, valueOf((await state()).rows, "bridge", "host_mic")]).toStrictEqual([
      null,
      "Wireless Microphone RX",
      null,
    ]);
  });

  test("an unknown key, the wrong scope, a value out of range or a bad device id stores nothing", async () => {
    const { set, state, sent } = await setup();
    const rejected = (...changes: Change[]) => expect(set(...changes)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await rejected({ target: KNOB, key: "brillo", value: 40 });
    await rejected({ target: "bridge", key: "brightness", value: 40 });
    await rejected({ target: KNOB, key: "brain", value: "eve" });
    await rejected({ target: "bridge", key: "status", value: {} });
    await rejected({ target: KNOB, key: "reduced_motion", value: true }, { target: KNOB, key: "brightness", value: 5 });
    await rejected({ target: "Owy Knob", key: "brightness", value: 40 });

    await expect(state()).resolves.toMatchObject({ rows: [] });
    expect(sent("rows")).toStrictEqual([]);
  });
});

describe("the bridge's report", () => {
  test("keeps its status, answers every stored row and tells the panels", async () => {
    const { set, report, state, sent } = await setup();
    await set({ target: KNOB, key: "brightness", value: 40 });

    const reply = await report({ results: [{ id: "c1", ok: true, data: { peak: 0.4 } }] });
    const now = await state();

    expect(reply.rows).toStrictEqual(now.rows);
    expect(reply.rows.map((row) => row.key)).toStrictEqual(["brightness"]);
    expect(now).toMatchObject({ status: { machine: "owu-mac", devices: [{ id: KNOB }] }, seenAt: expect.any(String) });
    // The panel's row went out when it was set; the report itself changed none.
    expect({ rows: sent("rows").length, status: sent("status"), result: sent("result") }).toStrictEqual({
      rows: 1,
      status: [{ status: now.status, seenAt: now.seenAt }],
      result: [{ id: "c1", ok: true, data: { peak: 0.4 } }],
    });
  });

  test("a change made on the device wins over an older row and loses to a newer one", async () => {
    const { set, report, sent } = await setup();
    await set({ target: KNOB, key: "brightness", value: 40 });
    const device = (value: number, setAt: string, setBy = "dispositivo") =>
      report({ changes: [{ target: KNOB, key: "brightness", value, setBy, setAt }] });

    const older = await device(55, ago(60_000));
    await tick();
    // A board's clock ahead of the site's counts as now, so the panel's next change still wins.
    const newer = await device(60, new Date(Date.now() + 3_600_000).toISOString());
    await tick();
    const admin = await set({ target: KNOB, key: "brightness", value: 30 });

    expect(older.rows).toMatchObject([{ key: "brightness", value: 40, setBy: "admin:Ana" }]);
    expect(newer.rows).toMatchObject([{ key: "brightness", value: 60, setBy: "dispositivo" }]);
    expect(Date.parse(newer.rows[0]!.setAt)).toBeLessThanOrEqual(Date.now());
    expect(admin.rows).toMatchObject([{ value: 30, setBy: "admin:Ana" }]);
    expect(sent("rows").map((payload) => (payload as { rows: { value: unknown }[] }).rows[0]?.value)).toStrictEqual([
      40, 60, 30,
    ]);
  });

  test("changes from someone other than the device, voice or local page, or with bad values, are dropped", async () => {
    const { report, sent } = await setup();
    const now = new Date().toISOString();

    const reply = await report({
      changes: [
        { target: KNOB, key: "brightness", value: 50, setBy: "admin:Mallory", setAt: now },
        { target: KNOB, key: "brightness", value: 500, setBy: "voz", setAt: now },
        { target: "bridge", key: "brightness", value: 50, setBy: "local", setAt: now },
        { target: "Owy Knob", key: "brightness", value: 50, setBy: "dispositivo", setAt: now },
        { target: KNOB, key: "reduced_motion", value: true, setBy: "voz", setAt: now },
      ],
    });

    expect(reply.rows).toMatchObject([{ target: KNOB, key: "reduced_motion", value: true, setBy: "voz" }]);
    expect(sent("rows")).toHaveLength(1);
  });

  test("the companion key reaches it over HTTP, as the bridge calls it", async () => {
    await setup();
    const bridge = await makeServiceAccount({ id: `companion-${Date.now()}`, name: "Owy companion" });
    const { key } = await mintServiceKey({
      ownerId: bridge.id,
      name: "bridge",
      permissions: KEY_PRESETS.companion,
      expiresInDays: 1,
      createdById: null,
    });
    const client: RouterClient<AppRouter> = createORPCClient(
      new RPCLink({
        origin: "http://owu.test",
        url: "/api/orpc",
        headers: () => ({ "x-api-key": key }),
        fetch: (url, init) => rpc(new Request(url, init)),
      })
    );

    await expect(client.companion.report({ status: status() })).resolves.toStrictEqual({ rows: [] });
    await expect(client.companion.state()).resolves.toMatchObject({ status: { machine: "owu-mac" } });
  });
});

describe("a command", () => {
  test("goes out only while the bridge is reporting, never queued", async () => {
    const { staff, report, sent } = await setup();
    const tone = () => call(router.companion.command, { command: { type: "tone", target: KNOB } }, by(staff));

    const before = await tone();
    await report();
    const live = await tone();
    await db
      .update(companionSettings)
      .set({ setAt: new Date(Date.now() - 31_000) })
      .where(and(eq(companionSettings.target, "bridge"), eq(companionSettings.key, "status")));
    const gone = await tone();

    expect([before.delivered, live.delivered, gone.delivered]).toStrictEqual([false, true, false]);
    expect(sent("command")).toStrictEqual([{ id: live.id, command: { type: "tone", target: KNOB } }]);
  });
});
