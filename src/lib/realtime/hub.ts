import "server-only";

import { createId } from "@paralleldrive/cuid2";
import type { WebSocket } from "ws";

import type { Permission } from "../authz/catalog";
import { isPublicChannel, parseFrame, type ClientFrame, type ServerFrame } from "./protocol";

type Connection = {
  ws: WebSocket;
  /** Asked on every private subscribe and publish (the caller caches who is behind the socket), so a revoked role stops the socket too. */
  can: (permission: Permission) => Promise<boolean>;
  channels: Set<string>;
  /** What its last publish needed: its heartbeat keeps that answer fresh, so its next publish doesn't wait on it. */
  publishes: Permission | null;
};

/**
 * What a channel takes to subscribe (private ones) and to publish: the OBS control bus
 * `obs:operate`, so a key that runs the stage and the companion (the bridge's) can't reach the
 * stream; every other channel `stage:operate`.
 */
export function channelPermission(channel: string): Permission {
  return channel.startsWith("private:obs:") ? "obs:operate" : "stage:operate";
}

/**
 * A lookup for a socket's lifetime (who is behind it): answered at most `ttlMs` ago, and asked
 * again ahead of time. Past `refreshMs` the answer in hand still counts while a fresh one comes in,
 * so with someone calling it on every heartbeat (25 s) a publish never waits on the lookup — a
 * session read that, after a quiet minute, can need a new database connection. A press on the
 * launchpad paid exactly that before reaching the speakers. A failed lookup answers null.
 */
export function cachedLookup<T>(lookup: () => Promise<T>, ttlMs = 30_000, refreshMs = 20_000) {
  type Answer = { at: number; value: Promise<T | null> };
  let current: Answer | null = null;
  let next: Answer | null = null;
  const ask = (): Answer => ({ at: Date.now(), value: lookup().catch(() => null) });

  return () => {
    const age = current ? Date.now() - current.at : Infinity;
    if (!current || age > ttlMs) {
      // Too old to use: wait for an answer, the one already on its way if there is one.
      current = next ?? ask();
      next = null;
    } else if (age > refreshMs && !next) {
      const fresh = ask();
      next = fresh;
      void fresh.value.then(() => {
        if (next !== fresh) return;
        current = fresh;
        next = null;
      });
    }

    return current.value;
  };
}

type BackplaneEnvelope = {
  ch: string;
  ev: string;
  pl: unknown;
  sid?: string;
  /** The message's id, fanned out as is by every instance (absent from an older one's). */
  id?: string;
  origin: string;
};

const REDIS_CHANNEL = "owu:realtime";
/** After a failed connection, how long until the next publish tries Redis again. */
const REDIS_RETRY_MS = 30_000;

function redisUrl(): string | undefined {
  return process.env.REDIS_URL ?? process.env.KV_URL;
}

/**
 * Per-function-instance connection registry. A WebSocket connection is pinned
 * to one instance; cross-instance fan-out goes through Redis pub/sub when
 * configured (Upstash via Vercel Marketplace). Without Redis, publishes reach
 * only this instance's connections (fine for dev / single warm instance).
 */
class RealtimeHub {
  readonly instanceId = createId();

  private channels = new Map<string, Set<Connection>>();
  private redisReady: Promise<{ pub: { publish: (ch: string, msg: string) => Promise<unknown> } } | null> | null = null;
  private warnedNoBackplane = false;

  attach(ws: WebSocket, options: { can: (permission: Permission) => Promise<boolean> }): void {
    // Join the backplane as soon as a socket lands here. Redis is what carries
    // publishes between function instances, and `ensureRedis` is where this
    // instance SUBSCRIBES — an instance that only holds sockets never
    // publishes, so without this it would never hear anything another instance
    // sent (a server-side write, or a client on a different instance).
    void this.ensureRedis();

    const connection: Connection = { ws, can: options.can, channels: new Set(), publishes: null };

    ws.on("message", (data: unknown) => {
      const frame = parseFrame<ClientFrame>(typeof data === "string" ? data : String(data));
      if (!frame) return;

      switch (frame.t) {
        case "sub": {
          void (async () => {
            if (!isPublicChannel(frame.ch) && !(await connection.can(channelPermission(frame.ch)))) {
              this.sendFrame(ws, { t: "err", msg: "forbidden", ch: frame.ch });

              return;
            }
            connection.channels.add(frame.ch);
            let set = this.channels.get(frame.ch);
            if (!set) {
              set = new Set();
              this.channels.set(frame.ch, set);
            }
            set.add(connection);
            // `ok` promises delivery (a client rotating its socket closes the old one on it): on a
            // fresh instance that includes what other instances publish, so the backplane first.
            await this.ensureRedis();
            this.sendFrame(ws, { t: "ok", ch: frame.ch });
          })();
          break;
        }
        case "unsub": {
          connection.channels.delete(frame.ch);
          this.detach(connection, frame.ch);
          break;
        }
        case "pub": {
          void (async () => {
            const permission = channelPermission(frame.ch);
            if (!(await connection.can(permission))) {
              this.sendFrame(ws, { t: "err", msg: "publish requires authentication", ch: frame.ch });

              return;
            }
            connection.publishes = permission;
            await this.publish(frame.ch, frame.ev, frame.pl, frame.sid);
          })();
          break;
        }
        case "ping": {
          this.sendFrame(ws, { t: "pong" });
          if (connection.publishes) void connection.can(connection.publishes);
          break;
        }
      }
    });

    ws.on("close", () => {
      for (const channel of connection.channels) {
        this.detach(connection, channel);
      }
      connection.channels.clear();
    });
  }

  /** Fan out to connections on THIS instance only. */
  publishLocal(channel: string, event: string, payload: unknown, senderId?: string, id?: string): void {
    const set = this.channels.get(channel);
    if (!set) return;

    const frame: ServerFrame = { t: "msg", ch: channel, ev: event, pl: payload, sid: senderId, id };
    const encoded = JSON.stringify(frame);
    for (const connection of set) {
      try {
        connection.ws.send(encoded);
      } catch {
        // dead socket; close handler cleans up
      }
    }
  }

  /** Fan out locally and across instances (via Redis, when configured). */
  async publish(channel: string, event: string, payload: unknown, senderId?: string): Promise<void> {
    const id = createId();
    this.publishLocal(channel, event, payload, senderId, id);

    const redis = await this.ensureRedis();
    if (redis) {
      const envelope: BackplaneEnvelope = {
        ch: channel,
        ev: event,
        pl: payload,
        sid: senderId,
        id,
        origin: this.instanceId,
      };
      await redis.pub.publish(REDIS_CHANNEL, JSON.stringify(envelope)).catch(() => undefined);
    } else if (!this.warnedNoBackplane && process.env.NODE_ENV === "production") {
      this.warnedNoBackplane = true;
      console.warn(
        "[realtime] No REDIS_URL/KV_URL configured — broadcasts only reach connections on this function instance."
      );
    }
  }

  private detach(connection: Connection, channel: string): void {
    const set = this.channels.get(channel);
    if (!set) return;
    set.delete(connection);
    if (set.size === 0) this.channels.delete(channel);
  }

  private sendFrame(ws: WebSocket, frame: ServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // ignore
    }
  }

  private ensureRedis() {
    this.redisReady ??= (async () => {
      const url = redisUrl();
      if (!url) return null;

      const { default: Redis } = await import("ioredis");
      const pub = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
      const sub = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
      try {
        await Promise.all([pub.connect(), sub.connect()]);

        await sub.subscribe(REDIS_CHANNEL);
        sub.on("message", (_channel: string, raw: string) => {
          try {
            const envelope = JSON.parse(raw) as BackplaneEnvelope;
            if (envelope.origin === this.instanceId) return; // already fanned out locally

            this.publishLocal(envelope.ch, envelope.ev, envelope.pl, envelope.sid, envelope.id);
          } catch {
            // malformed envelope; drop
          }
        });

        return { pub };
      } catch (error) {
        console.error("[realtime] Redis backplane unavailable, trying again later:", error);
        pub.disconnect();
        sub.disconnect();
        // Local-only until then, not for the rest of this instance's life.
        setTimeout(() => {
          this.redisReady = null;
        }, REDIS_RETRY_MS).unref();

        return null;
      }
    })();

    return this.redisReady;
  }
}

// Survive module re-evaluation within a warm instance.
const globalStore = globalThis as typeof globalThis & { __owuRealtimeHub?: RealtimeHub };

export const hub: RealtimeHub = (globalStore.__owuRealtimeHub ??= new RealtimeHub());
