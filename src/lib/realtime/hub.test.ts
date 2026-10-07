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
