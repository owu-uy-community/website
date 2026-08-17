"use client";

import { createId } from "@paralleldrive/cuid2";

import { parseFrame, type ClientFrame, type ServerFrame } from "./protocol";

export type RealtimeStatus = "connecting" | "open" | "closed";

type ChannelHandler = (event: string, payload: unknown, senderId: string | undefined) => void;

const HEARTBEAT_INTERVAL_MS = 25_000;
const STALE_CONNECTION_MS = 70_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

function defaultUrl(): string {
  if (typeof window === "undefined") return "";

  const explicit = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (explicit) return explicit;

  // `next dev` can't upgrade WebSockets (Vercel-runtime only), so local dev
  // talks to the sidecar from scripts/dev-realtime.mjs instead.
  if (process.env.NODE_ENV === "development") {
    return `ws://${window.location.hostname}:3199`;
  }

  const scheme = window.location.protocol === "https:" ? "wss" : "ws";

  return `${scheme}://${window.location.host}/api/realtime`;
}

/**
 * Singleton multiplexed WebSocket client. One connection per tab; channels are
 * subscribed/unsubscribed over it. Reconnects with exponential backoff and
 * resubscribes automatically (Vercel function instances recycle at
 * maxDuration, so connection drops are part of normal operation).
 */
class RealtimeClient {
  /** Identifies this connection's own publishes so subscribers can skip echoes. */
  readonly senderId = createId();

  private socket: WebSocket | null = null;
  private status: RealtimeStatus = "closed";
  private handlers = new Map<string, Set<ChannelHandler>>();
  private sendQueue: ClientFrame[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private statusListeners = new Set<(status: RealtimeStatus) => void>();
  private explicitlyClosed = false;

  getStatus(): RealtimeStatus {
    return this.status;
  }

  onStatusChange(listener: (status: RealtimeStatus) => void): () => void {
    this.statusListeners.add(listener);

    return () => this.statusListeners.delete(listener);
  }

  subscribe(channel: string, handler: ChannelHandler): () => void {
    let set = this.handlers.get(channel);
    const isNewChannel = !set;

    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);

    this.ensureConnected();
    if (isNewChannel) this.send({ t: "sub", ch: channel });

    return () => {
      const current = this.handlers.get(channel);
      if (!current) return;

      current.delete(handler);
      if (current.size === 0) {
        this.handlers.delete(channel);
        this.send({ t: "unsub", ch: channel });
      }
    };
  }

  publish(channel: string, event: string, payload: unknown): void {
    this.ensureConnected();
    this.send({ t: "pub", ch: channel, ev: event, pl: payload, sid: this.senderId });
  }

  private ensureConnected(): void {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.explicitlyClosed = false;
    this.setStatus("connecting");

    const url = defaultUrl();
    if (!url) return;

    try {
      this.socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();

      return;
    }

    this.socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("open");

      // Resubscribe every active channel after (re)connecting.
      for (const channel of this.handlers.keys()) {
        this.rawSend({ t: "sub", ch: channel });
      }
      for (const frame of this.sendQueue.splice(0)) {
        this.rawSend(frame);
      }
      this.startHeartbeat();
    });

    this.socket.addEventListener("message", (messageEvent) => {
      this.lastMessageAt = Date.now();
      const frame = parseFrame<ServerFrame>(messageEvent.data);
      if (!frame) return;

      if (frame.t === "msg") {
        const set = this.handlers.get(frame.ch);
        if (!set) return;
        for (const handler of set) {
          handler(frame.ev, frame.pl, frame.sid);
        }
      }
    });

    this.socket.addEventListener("close", () => {
      this.stopHeartbeat();
      this.setStatus("closed");
      if (!this.explicitlyClosed) this.scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      // close event follows; nothing to do here
    });
  }

  private send(frame: ClientFrame): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.rawSend(frame);
    } else {
      this.sendQueue.push(frame);
    }
  }

  private rawSend(frame: ClientFrame): void {
    try {
      this.socket?.send(JSON.stringify(frame));
    } catch {
      this.sendQueue.push(frame);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || typeof window === "undefined") return;
    if (this.handlers.size === 0) return; // nothing to reconnect for

    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay + Math.random() * 250);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

      if (Date.now() - this.lastMessageAt > STALE_CONNECTION_MS) {
        // Stale connection: force a reconnect cycle.
        this.socket.close();

        return;
      }
      this.rawSend({ t: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

let singleton: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  singleton ??= new RealtimeClient();

  return singleton;
}
