import type { RateLimiter } from "@orpc/ratelimit";
import { BaseRedisRateLimiter, type BaseRedisRateLimiterOptions } from "@orpc/ratelimit/base-redis";
import { MemoryRateLimiter } from "@orpc/ratelimit/memory";
import type Redis from "ioredis";

const redisUrl = () => process.env.REDIS_URL ?? process.env.KV_URL;

let redis: Promise<Redis> | undefined;
const connect = (url: string) =>
  (redis ??= import("ioredis").then(({ default: Client }) => new Client(url, { maxRetriesPerRequest: 1 })));

/** The bundled Redis adapter wants node-redis; the site already talks to Redis through ioredis. */
class IoRedisRateLimiter extends BaseRedisRateLimiter {
  constructor(
    private readonly url: string,
    options: BaseRedisRateLimiterOptions
  ) {
    super(options);
  }

  protected async evalScript(script: string, keys: string[], args: string[]) {
    try {
      return await (await connect(this.url)).eval(script, keys.length, ...keys, ...args);
    } catch {
      // ponytail: fails open — a Redis hiccup lets requests through rather than taking the feature down.
      return [0, 0];
    }
  }
}

/**
 * A fixed-window limiter. With Redis configured every instance counts
 * together; without it (local, tests) each instance keeps its own count.
 */
export function limiter(options: { prefix: string; maxRequests: number; window: number }): RateLimiter {
  const url = redisUrl();

  return url ? new IoRedisRateLimiter(url, options) : new MemoryRateLimiter(options);
}
