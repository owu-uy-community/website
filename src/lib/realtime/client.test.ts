import { afterEach, describe, expect, test, vi } from "vitest";

/** Just enough of a browser WebSocket: it answers pings like the hub (unless `silent`); the test opens, acks and drops it. */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static made: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  sent: Record<string, unknown>[] = [];
  closedWith: number | undefined;
  silent = false;
  private listeners = new Map<string, (event?: { data: string }) => void>();

  constructor() {
    FakeSocket.made.push(this);
  }

  addEventListener(type: string, listener: (event?: { data: string }) => void) {
    this.listeners.set(type, listener);
  }

  send(data: string) {
    const frame = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(frame);
    if (frame.t === "ping" && !this.silent) this.receive({ t: "pong" });
  }

  close(code?: number) {
    this.closedWith = code;
    this.drop();
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.listeners.get("open")?.();
  }

  receive(frame: object) {
    this.listeners.get("message")?.({ data: JSON.stringify(frame) });
  }

  drop() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.listeners.get("close")?.();
  }
}

async function connect() {
  vi.useFakeTimers();
  // Rotations start at exactly 240 s, reconnects without jitter.
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "ws://realtime.test");
  const { getRealtimeClient } = await import("./client");

  return getRealtimeClient();
}

describe("the realtime client's reconnect", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
    FakeSocket.made = [];
  });

  test("a socket the platform recycled comes back at once; one that never opened backs off", async () => {
    const client = await connect();
    client.subscribe("launchpad-sounds", () => undefined);
    FakeSocket.made[0]?.open();

    // Ended after a while (Vercel's cut, should no rotation make it): a new one right away, no backoff
    await vi.advanceTimersByTimeAsync(60_000);
    FakeSocket.made[0]?.drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.made).toHaveLength(2);

    // Refused before opening: that one waits (1 s and up), so a dead server isn't hammered
    FakeSocket.made[1]?.drop();
    await vi.advanceTimersByTimeAsync(900);
    expect(FakeSocket.made).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(400);
    expect(FakeSocket.made).toHaveLength(3);
  });

  test("a second socket takes over before Vercel's cut: no gap, no status change, each message once", async () => {
    const client = await connect();
    const heard: unknown[] = [];
    client.subscribe("owy-stage", (_event, payload) => heard.push(payload));
    client.subscribe("launchpad-sounds", () => undefined);
    const first = FakeSocket.made[0]!;
    first.open();
    const statuses: string[] = [];
    client.onStatusChange((status) => statuses.push(status));

    await vi.advanceTimersByTimeAsync(240_000);
    const second = FakeSocket.made[1]!;
    second.open();
    expect(second.sent).toStrictEqual([
      { t: "sub", ch: "owy-stage" },
      { t: "sub", ch: "launchpad-sounds" },
    ]);

    // Both carry what is published meanwhile: delivered once (by id; a frame without one passes)
    first.receive({ t: "msg", ch: "owy-stage", ev: "face", pl: 1, id: "m1" });
    second.receive({ t: "msg", ch: "owy-stage", ev: "face", pl: 1, id: "m1" });
    second.receive({ t: "msg", ch: "owy-stage", ev: "face", pl: 2, id: "m2" });
    first.receive({ t: "msg", ch: "owy-stage", ev: "face", pl: 2, id: "m2" });
    first.receive({ t: "msg", ch: "owy-stage", ev: "face", pl: "no id" });
    second.receive({ t: "msg", ch: "owy-stage", ev: "face", pl: "no id" });
    client.publish("launchpad-sounds", "play_sound", { soundId: "1" });

    second.receive({ t: "ok", ch: "owy-stage" });
    expect(first.closedWith).toBeUndefined();
    second.receive({ t: "ok", ch: "launchpad-sounds" });
    expect(first.closedWith).toBe(1000);

    second.receive({ t: "msg", ch: "owy-stage", ev: "face", pl: 3, id: "m3" });
    client.publish("launchpad-sounds", "play_sound", { soundId: "2" });
    const published = (socket: FakeSocket) => socket.sent.filter((frame) => frame.t === "pub").map((frame) => frame.pl);
    expect({ old: published(first), new: published(second) }).toStrictEqual({
      old: [{ soundId: "1" }],
      new: [{ soundId: "2" }],
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect({ heard, sockets: FakeSocket.made.length, statuses }).toStrictEqual({
      heard: [1, 2, "no id", "no id", 3],
      sockets: 2,
      statuses: [],
    });
  });

  test("a rotation that fails keeps the old socket and tries again later", async () => {
    const client = await connect();
    client.subscribe("owy-stage", () => undefined);
    const first = FakeSocket.made[0]!;
    first.open();
    const statuses: string[] = [];
    client.onStatusChange((status) => statuses.push(status));

    // Refused
    await vi.advanceTimersByTimeAsync(240_000);
    FakeSocket.made[1]?.drop();
    client.publish("owy-stage", "face", {});
    expect(first.sent.at(-1)).toMatchObject({ t: "pub" });

    // 10 s on, another; this one never opens: dropped after 5 s, and another 10 s later
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeSocket.made).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeSocket.made[2]?.closedWith).toBe(1000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect({ sockets: FakeSocket.made.length, oldClosed: first.closedWith, statuses }).toStrictEqual({
      sockets: 4,
      oldClosed: undefined,
      statuses: [],
    });
  });

  test("back from sleep or on a new network, a dead socket is replaced at once", async () => {
    const client = await connect();
    client.subscribe("owy-stage", () => undefined);
    const first = FakeSocket.made[0]!;
    first.open();

    // Heard from 1 s ago (its last pong): kept
    await vi.advanceTimersByTimeAsync(16_000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(FakeSocket.made).toHaveLength(1);

    // The laptop slept a minute (no timer ran): the socket still looks open
    vi.setSystemTime(Date.now() + 60_000);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(first.readyState).toBe(3);
    expect(FakeSocket.made).toHaveLength(2);

    // Refused twice (the backoff now 2 s); the network comes back: no waiting it out
    FakeSocket.made[1]?.drop();
    await vi.advanceTimersByTimeAsync(1_000);
    FakeSocket.made[2]?.drop();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.made).toHaveLength(4);
  });

  test("a socket that stops answering pings is replaced; a hidden tab's sleepy timers alone are no sign", async () => {
    const client = await connect();
    client.subscribe("owy-stage", () => undefined);
    const first = FakeSocket.made[0]!;
    first.open();

    // A background tab may run its timers once a minute: quiet, yet every ping was answered
    await vi.advanceTimersByTimeAsync(15_000);
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(FakeSocket.made).toHaveLength(1);

    // No answers anymore: replaced 45 s on (40 s quiet, at the heartbeat after)
    first.silent = true;
    await vi.advanceTimersByTimeAsync(44_000);
    expect(FakeSocket.made).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(first.readyState).toBe(3);
    expect(FakeSocket.made).toHaveLength(2);
  });

  test("while down only publishes wait, the newest 100; channels are subscribed from the handlers", async () => {
    const client = await connect();
    const off = client.subscribe("a", () => undefined);
    client.subscribe("b", () => undefined);
    off();
    for (let n = 0; n < 105; n++) client.publish("b", "tick", n);
    FakeSocket.made[0]?.open();

    const sent = FakeSocket.made[0]?.sent ?? [];
    expect(sent[0]).toStrictEqual({ t: "sub", ch: "b" });
    expect(sent.slice(1).map((frame) => frame.pl)).toStrictEqual(Array.from({ length: 100 }, (_, n) => n + 5));
  });
});
