import "server-only";

import { createId } from "@paralleldrive/cuid2";
import type { WebSocket } from "ws";

import { isPublicChannel, parseFrame, type ClientFrame, type ServerFrame } from "./protocol";

type Connection = {
  ws: WebSocket;
  canPublish: boolean;
  channels: Set<string>;
};

type BackplaneEnvelope = {
  ch: string;
  ev: string;
  pl: unknown;
  sid?: string;
  origin: string;
};

const REDIS_CHANNEL = "owu:realtime";

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
  private redisReady: Promise<{ pub: { publish: (ch: string, msg: string) => Promise<unknown> } } | null> | null =
    null;
  private warnedNoBackplane = false;

  attach(ws: WebSocket, options: { canPublish: boolean }): void {
    // Join the backplane as soon as a socket lands here. Redis is what carries
    // publishes between function instances, and `ensureRedis` is where this
    // instance SUBSCRIBES — an instance that only holds sockets never
    // publishes, so without this it would never hear anything another instance
    // sent (a server-side write, or a client on a different instance).
    void this.ensureRedis();

    const connection: Connection = { ws, canPublish: options.canPublish, channels: new Set() };

    ws.on("message", (data: unknown) => {
      const frame = parseFrame<ClientFrame>(typeof data === "string" ? data : String(data));
      if (!frame) return;

      switch (frame.t) {
        case "sub": {
          if (!isPublicChannel(frame.ch) && !options.canPublish) {
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
          this.sendFrame(ws, { t: "ok", ch: frame.ch });
          break;
        }
        case "unsub": {
          connection.channels.delete(frame.ch);
          this.detach(connection, frame.ch);
          break;
        }
        case "pub": {
          if (!connection.canPublish) {
            this.sendFrame(ws, { t: "err", msg: "publish requires authentication", ch: frame.ch });

            return;
          }
          void this.publish(frame.ch, frame.ev, frame.pl, frame.sid);
          break;
        }
        case "ping": {
          this.sendFrame(ws, { t: "pong" });
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
  publishLocal(channel: string, event: string, payload: unknown, senderId?: string): void {
    const set = this.channels.get(channel);
    if (!set) return;

    const frame: ServerFrame = { t: "msg", ch: channel, ev: event, pl: payload, sid: senderId };
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
    this.publishLocal(channel, event, payload, senderId);

    const redis = await this.ensureRedis();
    if (redis) {
      const envelope: BackplaneEnvelope = { ch: channel, ev: event, pl: payload, sid: senderId, origin: this.instanceId };
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

      try {
        const { default: Redis } = await import("ioredis");
        const pub = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
        const sub = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
        await Promise.all([pub.connect(), sub.connect()]);

        await sub.subscribe(REDIS_CHANNEL);
        sub.on("message", (_channel: string, raw: string) => {
          try {
            const envelope = JSON.parse(raw) as BackplaneEnvelope;
            if (envelope.origin === this.instanceId) return; // already fanned out locally

            this.publishLocal(envelope.ch, envelope.ev, envelope.pl, envelope.sid);
          } catch {
            // malformed envelope; drop
          }
        });

        return { pub };
      } catch (error) {
        console.error("[realtime] Redis backplane unavailable:", error);

        return null;
      }
    })();

    return this.redisReady;
  }
}

// Survive module re-evaluation within a warm instance.
const globalStore = globalThis as typeof globalThis & { __owuRealtimeHub?: RealtimeHub };

export const hub: RealtimeHub = (globalStore.__owuRealtimeHub ??= new RealtimeHub());
