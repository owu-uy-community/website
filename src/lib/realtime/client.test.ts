import { afterEach, describe, expect, test, vi } from "vitest";

/** Just enough of a browser WebSocket: it answers pings like the hub; the test opens and drops it. */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static made: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  private listeners = new Map<string, (event?: { data: string }) => void>();

  constructor() {
    FakeSocket.made.push(this);
  }

  addEventListener(type: string, listener: (event?: { data: string }) => void) {
    this.listeners.set(type, listener);
  }

  send() {
    this.listeners.get("message")?.({ data: JSON.stringify({ t: "pong" }) });
  }

  close() {
    this.drop();
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.listeners.get("open")?.();
  }

  drop() {
    this.readyState = 3;
    this.listeners.get("close")?.();
  }
}

describe("the realtime client's reconnect", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("a socket the platform recycled comes back at once; one that never opened backs off", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "ws://realtime.test");
    const { getRealtimeClient } = await import("./client");
    getRealtimeClient().subscribe("launchpad-sounds", () => undefined);
    FakeSocket.made[0]?.open();

    // Vercel ends it at maxDuration: a new one right away, no backoff
    await vi.advanceTimersByTimeAsync(300_000);
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
});
