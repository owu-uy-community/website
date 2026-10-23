import { afterEach, describe, expect, test, vi } from "vitest";

const connect = vi.fn<() => Promise<void>>();
const publish = vi.fn<(channel: string, message: string) => Promise<number>>(async () => 1);

vi.mock(import("ioredis"), () => ({
  default: class {
    connect = connect;
    disconnect = vi.fn<() => void>();
    subscribe = vi.fn<(channel: string) => Promise<number>>(async () => 1);
    on = vi.fn<(event: string, listener: () => void) => void>();
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
});

describe("a socket's permission to publish", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("is asked again ahead of time, so a press after a quiet spell doesn't wait on the lookup", async () => {
    vi.useFakeTimers();
    const { cachedCheck } = await import("./hub");
    const lookup = vi.fn<() => Promise<boolean>>(async () => true);
    const canPublish = cachedCheck(lookup);
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
    const { cachedCheck } = await import("./hub");
    const lookup = vi.fn<() => Promise<boolean>>(async () => true);
    const canPublish = cachedCheck(lookup);
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
    const canPublish = vi.fn<() => Promise<boolean>>(async () => true);
    hub.attach(ws as never, { canPublish });
    const frame = (value: object) => listeners.get("message")?.(JSON.stringify(value));

    frame({ t: "sub", ch: "launchpad-sounds" });
    frame({ t: "ping" });
    expect(canPublish).not.toHaveBeenCalled();

    frame({ t: "pub", ch: "launchpad-sounds", ev: "play_sound", pl: { soundId: "43" } });
    await vi.waitFor(() => expect(canPublish).toHaveBeenCalledOnce());
    frame({ t: "ping" });
    expect(canPublish).toHaveBeenCalledTimes(2);
  });
});
