import { afterEach, describe, expect, test, vi } from "vitest";

import { intersectGrants, PLATFORM_ROLE_GRANTS, type Permission } from "lib/authz/catalog";
import { KEY_PRESETS } from "lib/authz/keys";
import { can, type Principal } from "lib/authz/principal";

const connect = vi.fn<() => Promise<void>>();
const publish = vi.fn<(channel: string, message: string) => Promise<number>>(async () => 1);
/** What the backplane's subscriber hands this instance (another instance's publishes). */
let fromRedis: ((channel: string, raw: string) => void) | undefined;

vi.mock(import("ioredis"), () => ({
  default: class {
    connect = connect;
    disconnect = vi.fn<() => void>();
    subscribe = vi.fn<(channel: string) => Promise<number>>(async () => 1);
    on = (event: string, listener: (channel: string, raw: string) => void) => {
      if (event === "message") fromRedis = listener;
    };
    publish = publish;
  } as never,
}));

describe("the realtime hub's Redis backplane", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("#17 a failed Redis connection is retried later, not given up on for good", async () => {
    vi.stubEnv("REDIS_URL", "redis://redis.test:6379");
    vi.spyOn(console, "error").mockReturnValue(undefined);
    vi.useFakeTimers();
    connect.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { hub } = await import("./hub");

    await hub.publish("event:1:sync", "card_change", {});
    await hub.publish("event:1:sync", "card_change", {});
    expect(publish).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    await hub.publish("event:1:sync", "card_change", { n: 3 });

    expect(connect).toHaveBeenCalledTimes(4);
    expect(publish).toHaveBeenCalledWith("owu:realtime", expect.stringContaining('"n":3'));
  });

  test("a message's id is one: in its frames here and in the envelope every instance fans out", async () => {
    vi.stubEnv("REDIS_URL", "redis://redis.test:6379");
    const { hub } = await import("./hub");
    const listeners = new Map<string, (data: unknown) => void>();
    const send = vi.fn<(data: string) => void>();
    const ws = { on: (event: string, listener: (data: unknown) => void) => listeners.set(event, listener), send };
    hub.attach(ws as never, { can: async () => true });
    listeners.get("message")?.(JSON.stringify({ t: "sub", ch: "owy-stage" }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(JSON.stringify({ t: "ok", ch: "owy-stage" })));
    const sent = () => send.mock.calls.map(([data]) => JSON.parse(data) as Record<string, unknown>);

    await hub.publish("owy-stage", "face", { state: "idle" });
    const id = sent().at(-1)?.id;
    expect(id).toStrictEqual(expect.any(String));
    expect(JSON.parse(publish.mock.calls.at(-1)?.[1] ?? "{}")).toMatchObject({ ch: "owy-stage", id });

    // Another instance's keeps its id; one from an older instance has none and still goes out.
    fromRedis?.("owu:realtime", JSON.stringify({ ch: "owy-stage", ev: "face", pl: 1, id: "elsewhere", origin: "b" }));
    fromRedis?.("owu:realtime", JSON.stringify({ ch: "owy-stage", ev: "face", pl: 2, origin: "older" }));
    expect(sent().slice(-2)).toStrictEqual([
      { t: "msg", ch: "owy-stage", ev: "face", pl: 1, id: "elsewhere" },
      { t: "msg", ch: "owy-stage", ev: "face", pl: 2 },
    ]);
  });

  test("on a fresh instance a subscription is acked once the backplane listens (a rotating client drops its old socket on it)", async () => {
    vi.stubEnv("REDIS_URL", "redis://redis.test:6379");
    delete (globalThis as { __owuRealtimeHub?: unknown }).__owuRealtimeHub;
    vi.resetModules();
    let connected = () => {};
    connect.mockReturnValueOnce(new Promise<void>((resolve) => (connected = resolve)));
    const { hub } = await import("./hub");
    const listeners = new Map<string, (data: unknown) => void>();
    const send = vi.fn<(data: string) => void>();
    const ws = { on: (event: string, listener: (data: unknown) => void) => listeners.set(event, listener), send };
    hub.attach(ws as never, { can: async () => true });

    listeners.get("message")?.(JSON.stringify({ t: "sub", ch: "owy-stage" }));
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
    connected();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(JSON.stringify({ t: "ok", ch: "owy-stage" })));
  });
});

describe("a socket's permission to publish", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("is asked again ahead of time, so a press after a quiet spell doesn't wait on the lookup", async () => {
    vi.useFakeTimers();
    const { cachedLookup } = await import("./hub");
    const lookup = vi.fn<() => Promise<boolean>>(async () => true);
    const canPublish = cachedLookup(lookup);
    await canPublish();
    await vi.advanceTimersByTimeAsync(10_000);
    await canPublish();
    expect(lookup).toHaveBeenCalledOnce();

    // 25 s on (a heartbeat), with the role taken away meanwhile: the answer in hand, under 30 s
    // old, still counts while the new one comes in; from then on the new one does.
    await vi.advanceTimersByTimeAsync(15_000);
    lookup.mockResolvedValue(false);
    await expect(canPublish()).resolves.toBe(true);
    expect(lookup).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(canPublish()).resolves.toBe(false);
  });

  test("an answer older than 30 s is never used: the next publish waits for a fresh one", async () => {
    vi.useFakeTimers();
    const { cachedLookup } = await import("./hub");
    const lookup = vi.fn<() => Promise<boolean>>(async () => true);
    const canPublish = cachedLookup(lookup);
    await canPublish();

    await vi.advanceTimersByTimeAsync(31_000);
    lookup.mockReturnValueOnce(new Promise((resolve) => setTimeout(() => resolve(false), 1_000)));
    const answer = canPublish();
    let settled = false;
    void answer.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(500);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    await expect(answer).resolves.toBe(false);
  });

  test("the hub keeps it fresh on a publisher's heartbeat, and asks nothing of a socket that only listens", async () => {
    const { hub } = await import("./hub");
    const listeners = new Map<string, (data: unknown) => void>();
    const ws = {
      on: (event: string, listener: (data: unknown) => void) => listeners.set(event, listener),
      send: vi.fn<(data: string) => void>(),
    };
    const can = vi.fn<(permission: Permission) => Promise<boolean>>(async () => true);
    hub.attach(ws as never, { can });
    const frame = (value: object) => listeners.get("message")?.(JSON.stringify(value));

    frame({ t: "sub", ch: "launchpad-sounds" });
    frame({ t: "ping" });
    expect(can).not.toHaveBeenCalled();

    frame({ t: "pub", ch: "launchpad-sounds", ev: "play_sound", pl: { soundId: "43" } });
    await vi.waitFor(() => expect(can).toHaveBeenCalledExactlyOnceWith("stage:operate"));
    frame({ t: "ping" });
    expect(can).toHaveBeenCalledTimes(2);
  });

  test("the OBS bus takes obs:operate: the companion's key subscribes to its channel, never to OBS", async () => {
    const { hub } = await import("./hub");
    const listeners = new Map<string, (data: unknown) => void>();
    const send = vi.fn<(data: string) => void>();
    const ws = { on: (event: string, listener: (data: unknown) => void) => listeners.set(event, listener), send };
    // The bridge's service account behind a `companion` preset key: stage read/operate, no obs.
    const bridge: Principal = {
      id: "companion",
      name: "Owy companion",
      roles: ["service"],
      heldRoles: ["service"],
      via: "api-key",
      byId: null,
      banned: false,
      owuSlack: false,
      platform: PLATFORM_ROLE_GRANTS.service,
      ceiling: intersectGrants(KEY_PRESETS.companion, PLATFORM_ROLE_GRANTS.service),
      memberOf: null,
    };
    hub.attach(ws as never, { can: (permission) => can(bridge, permission) });
    const frame = (value: object) => listeners.get("message")?.(JSON.stringify(value));
    const replies = () => send.mock.calls.map(([data]) => JSON.parse(data) as Record<string, unknown>);

    frame({ t: "sub", ch: "private:obs:1" });
    frame({ t: "sub", ch: "private:companion" });
    frame({ t: "pub", ch: "private:obs:1", ev: "command", pl: { op: "stop-stream" } });

    await vi.waitFor(() => expect(replies()).toHaveLength(3));
    expect(replies()).toStrictEqual(
      expect.arrayContaining([
        { t: "err", msg: "forbidden", ch: "private:obs:1" },
        { t: "ok", ch: "private:companion" },
        { t: "err", msg: "publish requires authentication", ch: "private:obs:1" },
      ])
    );
  });
});
