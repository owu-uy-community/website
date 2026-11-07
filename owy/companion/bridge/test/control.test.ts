import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnvSchema, type BridgeConfig } from "../src/config";
import { ControlChannel } from "../src/control/channel";
import { ControlPlane, SettingsStore } from "../src/control/plane";
import type { DeviceSession } from "../src/index";
import { createLogger } from "../src/log";
import { buildCompanionToolSet, executeToolByName, type ToolRuntime } from "../src/realtime/tools";
import { COMPANION_CHANNEL, type Report, type SettingRow } from "../src/web/contract";
import type { SettingKey } from "../src/web/registry";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const logger = createLogger("test", "error");
const config = (): BridgeConfig => ({ ...EnvSchema.parse({}), devices: [] }) as BridgeConfig;
const row = (target: string, key: string, value: unknown, setAt: string, setBy = "admin:Ana"): SettingRow => ({
  target,
  key,
  value: value as SettingRow["value"],
  setBy,
  setAt,
});

/** A board session: what the plane drives and reads. */
function fakeSession(id = "owy-knob") {
  const values: Partial<Record<SettingKey, unknown>> = { brightness: 50, reduced_motion: false };
  const session = {
    id,
    busy: false,
    applied: [] as [SettingKey, unknown][],
    applySetting(key: SettingKey, value: unknown) {
      this.applied.push([key, value]);
      values[key] = value;
    },
    setting: (key: SettingKey) => values[key],
    deviceStatus: () => ({
      id,
      host: "192.168.1.56",
      connected: true,
      peer: false,
      staff: false,
      voice: { tier: null, realtime: "connected" as const, lastPath: null },
      turns: [],
      values: { ...values } as never,
      held: [],
    }),
    testTone: vi.fn(),
    say: vi.fn(async () => {}),
    ask: vi.fn(async () => {}),
    hush: vi.fn(),
    tap: vi.fn(),
    pitchAction: vi.fn(),
    setStaff: vi.fn(),
  };
  return session;
}

function plane(options: { report?: (input: Report) => Promise<unknown>; sessions?: ReturnType<typeof fakeSession>[] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "owy-control-"));
  const store = new SettingsStore(path.join(dir, "state.json"));
  const sessions = options.sessions ?? [fakeSession()];
  const restart = vi.fn();
  const reports: Report[] = [];
  const control = new ControlPlane({
    config: config(),
    shared: {} as never,
    sessions: sessions as unknown as DeviceSession[],
    store,
    logger,
    version: "test",
    report:
      options.report ??
      (async (input) => {
        reports.push(input);
        return { rows: [] };
      }),
    restart,
  });
  return { control, store, sessions, restart, reports, dir };
}

describe("control plane", () => {
  it("follows the panel's rows onto the board, and its own write echoing back is not a change", async () => {
    const { control, sessions, reports } = plane();
    control.onEvent(COMPANION_CHANNEL, "rows", { rows: [row("owy-knob", "brightness", 70, "2026-11-01T22:00:00.000Z")] });
    expect(sessions[0].applied).toEqual([["brightness", 70]]);
    control.deviceSetting(sessions[0] as never, "brightness", 70, "dispositivo");
    await vi.advanceTimersByTimeAsync(1_300);
    // One report, after the board had its second to take it: the panel sees 70 in effect, and no change of its own.
    expect(reports).toHaveLength(1);
    expect(reports[0].changes).toEqual([]);
    expect(reports[0].status.devices[0].values).toMatchObject({ brightness: 70 });
  });

  it("reports a change made on the board once, as the device's", async () => {
    const { control, sessions, reports, store } = plane();
    control.deviceSetting(sessions[0] as never, "reduced_motion", true, "dispositivo");
    control.deviceSetting(sessions[0] as never, "reduced_motion", true, "dispositivo");
    await vi.advanceTimersByTimeAsync(400);
    expect(reports).toHaveLength(1);
    expect(reports[0].changes).toMatchObject([{ target: "owy-knob", key: "reduced_motion", value: true, setBy: "dispositivo" }]);
    expect(store.takePending()).toEqual([]);
  });

  it("a board coming back up reports its boot values as nothing, and gets the wanted ones again", async () => {
    const { control, store, sessions, reports } = plane();
    store.merge([row("owy-knob", "brightness", 70, "2026-11-01T22:00:00.000Z")]);
    control.linkUp(sessions[0] as never);
    control.deviceSetting(sessions[0] as never, "brightness", 30, "dispositivo"); // its boot value
    await vi.advanceTimersByTimeAsync(3_100);
    expect(sessions[0].applied).toContainEqual(["brightness", 70]);
    expect(reports.flatMap((report) => report.changes ?? [])).toEqual([]);
  });

  it("keeps a change made while the site is out of reach, and sends it once the site answers", async () => {
    let up = false;
    const reports: Report[] = [];
    const { control, sessions, store } = plane({
      report: async (input) => {
        if (!up) throw new Error("ECONNREFUSED");
        reports.push(input);
        return { rows: [] };
      },
    });
    control.start();
    control.deviceSetting(sessions[0] as never, "brightness", 20, "dispositivo");
    await vi.advanceTimersByTimeAsync(400);
    expect(store.takePending()).toHaveLength(1);
    up = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(reports[0].changes).toMatchObject([{ key: "brightness", value: 20 }]);
    expect(store.takePending()).toHaveLength(0);
  });

  it("a newer change made here survives an older row from the site", () => {
    const { store } = plane();
    const local = store.record("owy-knob", "brightness", 20, "voz");
    const older = row("owy-knob", "brightness", 70, new Date(Date.parse(local.setAt) - 1000).toISOString());
    expect(store.merge([older])).toEqual([]);
    expect(store.desired("owy-knob", "brightness")?.value).toBe(20);
  });

  it("a restart-scope setting waits for a moment without turns", async () => {
    const { control, sessions, restart } = plane();
    sessions[0].busy = true;
    control.onEvent(COMPANION_CHANNEL, "rows", { rows: [row("bridge", "brain", "local", "2026-11-01T22:00:00.000Z")] });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(restart).not.toHaveBeenCalled();
    expect(control.status().pending).toEqual(["brain"]);
    sessions[0].busy = false;
    await vi.advanceTimersByTimeAsync(2_100);
    // It saves the settings to disk first (real I/O), then restarts.
    vi.useRealTimers();
    await vi.waitFor(() => expect(restart).toHaveBeenCalledOnce());
  });

  it("runs the panel's commands and reports each result", async () => {
    const { control, sessions, reports } = plane();
    control.onEvent(COMPANION_CHANNEL, "command", { id: "c1", command: { type: "tap", deviceId: "owy-knob" } });
    control.onEvent(COMPANION_CHANNEL, "command", { id: "c2", command: { type: "hush", deviceId: "nope" } });
    control.onEvent(COMPANION_CHANNEL, "command", { id: "c3", command: { type: "pitch", deviceId: "owy-knob", action: "submit" } });
    control.onEvent(COMPANION_CHANNEL, "command", { id: "c4", command: { type: "ask", deviceId: "owy-knob", text: "¿Qué hay ahora?" } });
    await vi.advanceTimersByTimeAsync(10);
    expect(sessions[0].tap).toHaveBeenCalledOnce();
    expect(sessions[0].pitchAction).toHaveBeenCalledWith("submit");
    expect(sessions[0].ask).toHaveBeenCalledWith("¿Qué hay ahora?", "presenter");
    expect(reports.at(-1)?.results).toEqual([
      { id: "c1", ok: true },
      { id: "c2", ok: false, error: "no conozco el dispositivo «nope»" },
      { id: "c3", ok: true },
      { id: "c4", ok: true },
    ]);
  });

  it("validates a voice change against the registry and its scope", () => {
    const { control } = plane();
    expect(control.change("owy-knob", "brightness", 300, "voz")).toMatchObject({ ok: false });
    expect(control.change("bridge", "brightness", 40, "voz")).toMatchObject({ ok: false });
    expect(control.change("owy-knob", "brightness", 40, "voz")).toEqual({ ok: true, value: 40 });
  });
});

describe("Owy's ajustes tool", () => {
  function tools(staff = false) {
    const values: Record<string, unknown> = { brightness: 50, pitch_mode: false, privacy: false };
    const changes: [string, unknown][] = [];
    const runtime = {
      deviceId: "owy-knob",
      isStaff: () => staff,
      isMarketplaceOpen: () => false,
      proposalCooldownMs: 0,
      logger,
      settings: {
        get: (key: string) => values[key],
        set: (key: string, value: unknown) => {
          changes.push([key, value]);
          values[key] = value;
          return { ok: true as const, value };
        },
      },
    } as unknown as ToolRuntime;
    return { set: buildCompanionToolSet(new Map(), runtime), changes };
  }
  const call = (set: ReturnType<typeof tools>["set"], input: object) => executeToolByName(set, "ajustes", input, "c1");

  it("replaces set_volume and lets anyone change comfort settings", async () => {
    const { set, changes } = tools();
    expect(set.set_volume).toBeUndefined();
    await expect(call(set, { clave: "brightness", paso: 60 })).resolves.toMatchObject({ ok: true, valor: "100 %" });
    expect(changes).toEqual([["brightness", 100]]);
  });

  it("leaves modes to staff and never turns privacy off by voice", async () => {
    const { set } = tools();
    await expect(call(set, { clave: "pitch_mode", valor: "sí" })).resolves.toMatchObject({ ok: false, error: "eso lo cambia el staff" });
    await expect(call(set, { clave: "privacy", valor: "sí" })).resolves.toMatchObject({ ok: true });
    const staff = tools(true);
    await expect(call(staff.set, { clave: "privacy", valor: "no" })).resolves.toMatchObject({ ok: false });
    await expect(call(staff.set, { clave: "pitch_mode", valor: "sí" })).resolves.toMatchObject({ ok: true, cuando: "desde el próximo turno" });
  });

  it("lists only what this person may change", async () => {
    const visitor = (await call(tools().set, {})) as { ajustes: { clave: string }[] };
    expect(visitor.ajustes.map((entry) => entry.clave)).toContain("brightness");
    expect(visitor.ajustes.map((entry) => entry.clave)).not.toContain("pitch_mode");
  });
});

describe("control channel", () => {
  class FakeSocket extends EventEmitter {
    sent: unknown[] = [];
    closed = false;
    send(data: string) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.closed = true;
    }
    receive(frame: object) {
      this.emit("message", JSON.stringify(frame));
    }
  }

  it("subscribes with the key, hands events over, and reconnects after a recycle", async () => {
    const sockets: { socket: FakeSocket; headers: Record<string, string> }[] = [];
    const events: [string, string, unknown][] = [];
    const opened = vi.fn();
    const channel = new ControlChannel({
      url: "wss://www.owu.uy/api/realtime",
      apiKey: "owy_key",
      channels: [COMPANION_CHANNEL],
      logger,
      onEvent: (ch, ev, pl) => events.push([ch, ev, pl]),
      onOpen: opened,
      createSocket: (_url, headers) => {
        const socket = new FakeSocket();
        sockets.push({ socket, headers });
        return socket as never;
      },
    });
    channel.start();
    const first = sockets[0].socket;
    expect(sockets[0].headers).toEqual({ "x-api-key": "owy_key" });
    first.emit("open");
    expect(first.sent).toEqual([{ t: "sub", ch: COMPANION_CHANNEL }]);
    first.receive({ t: "ok", ch: COMPANION_CHANNEL });
    expect(opened).toHaveBeenCalledOnce();
    first.receive({ t: "msg", ch: COMPANION_CHANNEL, ev: "rows", pl: { rows: [] } });
    expect(events).toEqual([[COMPANION_CHANNEL, "rows", { rows: [] }]]);

    await vi.advanceTimersByTimeAsync(120_000); // pings keep it alive while it answers…
    first.receive({ t: "pong" });
    first.emit("close", 1006, Buffer.from("recycled"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
    channel.stop();
  });

  it("a key without stage:operate backs off instead of hammering the site", async () => {
    const sockets: FakeSocket[] = [];
    const channel = new ControlChannel({
      url: "wss://www.owu.uy/api/realtime",
      apiKey: "owy_key",
      channels: [COMPANION_CHANNEL],
      logger,
      onEvent: () => {},
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as never;
      },
    });
    channel.start();
    sockets[0].emit("open");
    sockets[0].receive({ t: "err", msg: "forbidden", ch: COMPANION_CHANNEL });
    expect(sockets[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(sockets).toHaveLength(2);
    channel.stop();
  });
});
