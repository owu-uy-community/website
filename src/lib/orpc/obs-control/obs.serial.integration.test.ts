import { call } from "@orpc/server";
import { sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by } from "test/context";
import { makeSiteAdmin, makeUser } from "test/factories";

/** OBS rigs 1 and 2 are global rows, so every test starts from empty rigs. */
async function setup() {
  await db.execute(
    sql`TRUNCATE obs_preset_items, obs_presets, obs_queue_items, obs_commands, obs_cues, obs_instances CASCADE`
  );
  const staff = await makeSiteAdmin();

  return { staff };
}

const cue = (name: string, extra: Record<string, unknown> = {}) => ({ instanceId: 1, name, ...extra });

describe("obsQueue", () => {
  test("a rig that was never used reads as an empty, stopped queue", async () => {
    await setup();

    await expect(call(router.obsQueue.getState, { instanceId: 1 }, by(null))).resolves.toStrictEqual({
      queueItems: [],
      isPlaying: false,
      currentItemIndex: 0,
      directMode: false,
      presets: [],
      currentPreset: "",
      version: 1,
    });
  });

  test("staff saves the queue; the version moves and the control screens are told", async () => {
    const { staff } = await setup();
    const publish = vi.spyOn(hub, "publish");

    const state = await call(
      router.obsQueue.updateState,
      {
        instanceId: 1,
        data: {
          queueItems: [
            { id: "q1", sceneName: "Sponsors", delay: 10, position: 0 },
            { id: "q2", sceneName: "Agenda", delay: 20, position: 1 },
          ],
          isPlaying: true,
        },
      },
      by(staff)
    );

    expect(state).toMatchObject({ isPlaying: true, version: 2 });
    expect(state.queueItems.map((item) => item.sceneName)).toStrictEqual(["Sponsors", "Agenda"]);
    expect(publish).toHaveBeenCalledWith(
      "obs_queue_listener_1",
      "state_update",
      expect.objectContaining({ instanceId: 1, version: 2 })
    );
  });

  test("the first reads of a fresh rig don't trip over each other", async () => {
    await setup();

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => call(router.obsQueue.getState, { instanceId: 2 }, by(null)))
    );

    expect(results.map((result) => result.status)).toStrictEqual(Array.from({ length: 6 }, () => "fulfilled"));
  });

  test("#22 both rigs can queue an item that happens to share a client id", async () => {
    const { staff } = await setup();
    const item = { id: "q1", sceneName: "Sponsors", delay: 10, position: 0 };

    await call(router.obsQueue.updateState, { instanceId: 1, data: { queueItems: [item] } }, by(staff));
    const second = await call(router.obsQueue.updateState, { instanceId: 2, data: { queueItems: [item] } }, by(staff));

    expect(second.queueItems.map((queued) => queued.sceneName)).toStrictEqual(["Sponsors"]);
  });

  test("#22 two presets saved from the same queue keep their own items", async () => {
    const { staff } = await setup();
    const items = [
      { id: "q1", sceneName: "Sponsors", delay: 10, position: 0 },
      { id: "q2", sceneName: "Agenda", delay: 20, position: 1 },
    ];
    const save = (presets: { id: string; name: string; items: typeof items }[]) =>
      call(router.obsQueue.updateState, { instanceId: 1, data: { presets } }, by(staff));

    await save([{ id: "p1", name: "Mañana", items }]);
    const state = await save([
      { id: "p1", name: "Mañana", items },
      { id: "p2", name: "Tarde", items },
    ]);

    expect(state.presets.map((preset) => [preset.name, preset.items.map((item) => item.sceneName)])).toStrictEqual([
      ["Mañana", ["Sponsors", "Agenda"]],
      ["Tarde", ["Sponsors", "Agenda"]],
    ]);
  });

  test("loop buttons play, step around the queue and stop back at the start", async () => {
    const { staff } = await setup();
    const loop = (action: "play" | "pause" | "stop" | "next" | "prev") =>
      call(router.obsQueue.loop, { instanceId: 1, action }, by(staff));
    await call(
      router.obsQueue.updateState,
      {
        instanceId: 1,
        data: {
          queueItems: ["A", "B", "C"].map((sceneName, position) => ({ id: sceneName, sceneName, delay: 5, position })),
        },
      },
      by(staff)
    );

    const steps = [await loop("play"), await loop("prev"), await loop("next"), await loop("next"), await loop("stop")];

    expect(steps.map((state) => [state.isPlaying, state.currentItemIndex])).toStrictEqual([
      [true, 0],
      [true, 2],
      [true, 0],
      [true, 1],
      [false, 0],
    ]);
  });

  test("#11 NEXT presses on the loop at once each step once", async () => {
    const { staff } = await setup();
    const scenes = Array.from({ length: 10 }, (_, position) => ({
      id: `s${position}`,
      sceneName: `S${position}`,
      delay: 5,
      position,
    }));
    await call(router.obsQueue.updateState, { instanceId: 1, data: { queueItems: scenes } }, by(staff));
    const next = () => call(router.obsQueue.loop, { instanceId: 1, action: "next" }, by(staff));

    await Promise.all(Array.from({ length: 6 }, next));

    await expect(call(router.obsQueue.getState, { instanceId: 1 }, by(null))).resolves.toMatchObject({
      currentItemIndex: 6,
    });
  });
});

describe("obsControl bus", () => {
  test("a command waits for the executor until it is acknowledged", async () => {
    const { staff } = await setup();

    const sent = await call(
      router.obsControl.send,
      { instanceId: 1, type: "scene", payload: { sceneName: "Escenario" } },
      by(staff)
    );
    const pending = await call(router.obsControl.pending, { instanceId: 1 }, by(staff));
    await call(router.obsControl.ack, { id: sent.id, ok: true }, by(staff));
    const [history] = await call(router.obsControl.history, { instanceId: 1 }, by(staff));

    expect(sent.executorOnline).toBe(false);
    expect(pending.map((command) => [command.id, command.type, command.payload])).toStrictEqual([
      [sent.id, "scene", { sceneName: "Escenario" }],
    ]);
    expect(history).toMatchObject({ id: sent.id, status: "done", source: `admin:${staff.name}` });
  });

  test("two TAKEs within half a second are one press", async () => {
    const { staff } = await setup();

    const first = await call(router.obsControl.send, { instanceId: 1, type: "take", payload: {} }, by(staff));
    const second = await call(router.obsControl.send, { instanceId: 1, type: "take", payload: {} }, by(staff));

    expect(second.id).toBe(first.id);
  });

  test("#11 TAKEs at the same moment are still one press", async () => {
    const { staff } = await setup();
    const take = () => call(router.obsControl.send, { instanceId: 1, type: "take", payload: {} }, by(staff));
    // A rig in use, and a connection ready for each press, so the presses really overlap.
    await Promise.all(Array.from({ length: 6 }, () => call(router.obsControl.status, { instanceId: 1 }, by(staff))));

    const sent = await Promise.all(Array.from({ length: 6 }, take));

    expect(new Set(sent.map((command) => command.id)).size).toBe(1);
  });

  test("commands from an API key are told apart from the admin screen in the history", async () => {
    const { staff } = await setup();

    await call(router.obsControl.send, { instanceId: 1, type: "cut", payload: {} }, by(staff, { apiKey: true }));

    const [history] = await call(router.obsControl.history, { instanceId: 1 }, by(staff));
    expect(history.source).toBe(`api-key:${staff.name}`);
  });

  test("a command nobody ran within 30 s is skipped, never replayed late", async () => {
    const { staff } = await setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
    const sent = await call(router.obsControl.send, { instanceId: 1, type: "cut", payload: {} }, by(staff));

    vi.setSystemTime(new Date("2026-11-07T18:00:31.000Z"));

    await expect(call(router.obsControl.pending, { instanceId: 1 }, by(staff))).resolves.toStrictEqual([]);
    const [history] = await call(router.obsControl.history, { instanceId: 1 }, by(staff));
    expect(history).toMatchObject({ id: sent.id, status: "skipped" });
  });

  test("one executor holds the seat until it lets go or someone forces it", async () => {
    const { staff } = await setup();
    const claim = (executorId: string, force = false) =>
      call(router.obsControl.claim, { instanceId: 1, executorId, force }, by(staff));

    await claim("tab-a");
    const contested = await claim("tab-b");
    const forced = await claim("tab-b", true);
    const released = await call(router.obsControl.release, { instanceId: 1, executorId: "tab-b" }, by(staff));

    expect([contested.executorId, forced.executorId, released.executorId]).toStrictEqual(["tab-a", "tab-b", null]);
  });

  test("a report from a tab that lost the seat is ignored", async () => {
    const { staff } = await setup();
    await call(router.obsControl.claim, { instanceId: 1, executorId: "tab-a", force: false }, by(staff));

    const status = await call(
      router.obsControl.report,
      { instanceId: 1, executorId: "tab-b", status: { connected: true, programScene: "Intruso" } },
      by(staff)
    );

    expect(status).toMatchObject({ executorId: "tab-a", programScene: null });
  });

  test("the bus is staff-only", async () => {
    await setup();
    const user = await makeUser();

    await expect(
      call(router.obsControl.send, { instanceId: 1, type: "cut", payload: {} }, by(user))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("obsCue rundown", () => {
  test("cues are appended, reordered, edited and removed", async () => {
    const { staff } = await setup();
    const intro = await call(router.obsCue.create, cue("Intro"), by(staff));
    const talk = await call(router.obsCue.create, cue("Charla"), by(staff));

    await call(router.obsCue.reorder, { instanceId: 1, ids: [talk.id, intro.id] }, by(staff));
    await call(router.obsCue.update, { id: talk.id, name: "Keynote", color: "red" }, by(staff));
    await call(router.obsCue.remove, { id: intro.id }, by(staff));
    const cues = await call(router.obsCue.list, { instanceId: 1 }, by(staff));

    expect([intro.position, talk.position]).toStrictEqual([0, 1]);
    expect(cues.map((c) => [c.name, c.color, c.position])).toStrictEqual([["Keynote", "red", 0]]);
  });

  test("firing a cue moves the pointer and queues its OBS scene", async () => {
    const { staff } = await setup();
    const opening = await call(router.obsCue.create, cue("Apertura", { obsScene: "Escenario" }), by(staff));

    const fired = await call(router.obsCue.fire, { id: opening.id }, by(staff));
    const status = await call(router.obsControl.status, { instanceId: 1 }, by(staff));
    const [command] = await call(router.obsControl.pending, { instanceId: 1 }, by(staff));

    expect(fired.commandId).toBe(command.id);
    expect(status.currentCueId).toBe(opening.id);
    expect(command.payload).toStrictEqual({ sceneName: "Escenario", cue: "Apertura" });
  });

  test("stepping walks the rundown and wraps around; an empty rundown steps to nothing", async () => {
    const { staff } = await setup();
    const step = (direction: "next" | "prev") => call(router.obsCue.step, { instanceId: 1, direction }, by(staff));

    await expect(step("next")).resolves.toBeNull();
    const a = await call(router.obsCue.create, cue("A"), by(staff));
    const b = await call(router.obsCue.create, cue("B"), by(staff));

    const landed = [await step("next"), await step("next"), await step("next"), await step("prev")];

    expect(landed.map((result) => result?.cue.id)).toStrictEqual([a.id, b.id, a.id, b.id]);
  });

  test("#12 an unknown cue is NOT_FOUND", async () => {
    const { staff } = await setup();

    await expect(call(router.obsCue.fire, { id: "no-existe" }, by(staff))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(call(router.obsCue.update, { id: "no-existe", name: "X" }, by(staff))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("#11 two NEXT presses at once advance the rundown twice", async () => {
    const { staff } = await setup();
    const cues = [];
    for (const name of ["A", "B", "C"]) cues.push(await call(router.obsCue.create, cue(name), by(staff)));
    await call(router.obsCue.fire, { id: cues[0].id }, by(staff));

    await Promise.all([
      call(router.obsCue.step, { instanceId: 1, direction: "next" }, by(staff)),
      call(router.obsCue.step, { instanceId: 1, direction: "next" }, by(staff)),
    ]);

    const status = await call(router.obsControl.status, { instanceId: 1 }, by(staff));
    expect(status.currentCueId).toBe(cues[2].id);
  });
});
