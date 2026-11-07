"use client";

import { createId } from "@paralleldrive/cuid2";

import { parseFrame, type ClientFrame, type ServerFrame } from "./protocol";

export type RealtimeStatus = "connecting" | "open" | "closed";

type ChannelHandler = (event: string, payload: unknown, senderId: string | undefined) => void;

const HEARTBEAT_INTERVAL_MS = 15_000;
const STALE_CONNECTION_MS = 40_000;
/** Back from sleep or on another network, a socket this quiet is taken for dead. */
const WAKE_STALE_MS = 20_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
/** A socket that lasted this long was recycled, not refused: it comes back at once. */
const RECYCLED_AFTER_MS = 10_000;
/**
 * Vercel ends every socket at the function's maxDuration (300 s). Before that a second socket
 * subscribes every channel and takes over (make before break), so nothing published around the
 * cut is lost. It gets ROTATE_STEP_MS to open, then as long again for its acks.
 */
const ROTATE_AFTER_MS = 240_000;
const ROTATE_JITTER_MS = 15_000;
const ROTATE_STEP_MS = 5_000;
const ROTATE_RETRY_MS = 10_000;
/** Ids of the messages delivered last: during a rotation both sockets carry each one. */
const SEEN_IDS = 500;
/** Publishes held while the socket is down; past this the oldest go. */
const MAX_QUEUED = 100;

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
  /** The socket taking over (see ROTATE_AFTER_MS) and the channels it has acknowledged. */
  private rotation: { socket: WebSocket; acked: Set<string> } | null = null;
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  private seen = new Set<string>();
  private status: RealtimeStatus = "closed";
  private handlers = new Map<string, Set<ChannelHandler>>();
  private sendQueue: ClientFrame[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private lastPingAt = 0;
  private openedAt = 0;
  private statusListeners = new Set<(status: RealtimeStatus) => void>();
  private explicitlyClosed = false;
  private watchingWake = false;

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
    this.watchWake();
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.explicitlyClosed = false;
    this.setStatus("connecting");

    try {
      this.socket = this.dial();
    } catch {
      this.scheduleReconnect();
    }
  }

  /** A socket wired to this client: its events count while it is the current one or the one rotating in. */
  private dial(): WebSocket | null {
    const url = defaultUrl();
    if (!url) return null;

    const socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      if (socket === this.rotation?.socket) {
        for (const channel of this.handlers.keys()) this.rawSend({ t: "sub", ch: channel }, socket);
        // It takes over once every channel is acknowledged, or after ROTATE_STEP_MS anyway.
        if (this.rotateTimer) clearTimeout(this.rotateTimer);
        this.rotateTimer = setTimeout(() => this.promote(), ROTATE_STEP_MS);

        return;
      }
      if (socket !== this.socket) return;

      this.reconnectAttempt = 0;
      this.openedAt = Date.now();
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
      this.scheduleRotation();
    });

    socket.addEventListener("message", (messageEvent) => {
      const rotation = socket === this.rotation?.socket ? this.rotation : null;
      if (!rotation && socket !== this.socket) return;
      if (!rotation) this.lastMessageAt = Date.now();
      const frame = parseFrame<ServerFrame>(messageEvent.data);
      if (!frame) return;

      if (frame.t === "ok" && rotation) {
        rotation.acked.add(frame.ch);
        if ([...this.handlers.keys()].every((channel) => rotation.acked.has(channel))) this.promote();
      }
      if (frame.t === "msg" && !this.seenBefore(frame.id)) {
        const set = this.handlers.get(frame.ch);
        if (!set) return;
        for (const handler of set) {
          handler(frame.ev, frame.pl, frame.sid);
        }
      }
    });

    socket.addEventListener("close", () => {
      // A rotation that failed: the current socket carries on, and another try comes later.
      if (socket === this.rotation?.socket) return this.scheduleRotation(ROTATE_RETRY_MS);
      if (socket !== this.socket) return;

      // Vercel ends every socket at the function's maxDuration (5 min). Waiting out the backoff
      // then left a second or more in which a sound board's output missed every press.
      this.lost(this.openedAt > 0 && Date.now() - this.openedAt > RECYCLED_AFTER_MS);
    });

    socket.addEventListener("error", () => {
      // close event follows; nothing to do here
    });

    return socket;
  }

  /** Make before break: a second socket subscribes every channel and takes over once it has them all. */
  private rotate(): void {
    this.rotateTimer = null;
    // Not open: the close path reconnects (and that socket rotates in turn).
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    // Nothing subscribed: nothing to carry over yet.
    if (this.handlers.size === 0) return this.scheduleRotation(ROTATE_RETRY_MS);

    let socket: WebSocket | null = null;
    try {
      socket = this.dial();
    } catch {
      // tried again below
    }
    if (!socket) return this.scheduleRotation(ROTATE_RETRY_MS);

    this.rotation = { socket, acked: new Set() };
    // Not open by then: dropped, and tried again later.
    this.rotateTimer = setTimeout(() => this.scheduleRotation(ROTATE_RETRY_MS), ROTATE_STEP_MS);
  }

  /** The new socket has every channel: it becomes the current one and the old one goes. The status stays open. */
  private promote(): void {
    const rotation = this.rotation;
    if (!rotation) return;

    const old = this.socket;
    this.rotation = null;
    this.socket = rotation.socket;
    this.openedAt = this.lastMessageAt = Date.now();
    this.scheduleRotation();
    old?.close(1000);
  }

  /** The next rotation (or another try): one in flight is dropped, the current socket carries on. */
  private scheduleRotation(delayMs = ROTATE_AFTER_MS + Math.random() * ROTATE_JITTER_MS): void {
    this.stopRotation();
    this.rotateTimer = setTimeout(() => this.rotate(), delayMs);
  }

  private stopRotation(): void {
    if (this.rotateTimer) clearTimeout(this.rotateTimer);
    this.rotateTimer = null;
    const socket = this.rotation?.socket;
    this.rotation = null;
    socket?.close(1000);
  }

  /** True for a message already delivered (both sockets carry it during a rotation). No id (an older server): never. */
  private seenBefore(id: string | undefined): boolean {
    if (!id) return false;
    if (this.seen.has(id)) return true;

    this.seen.add(id);
    // A Set keeps insertion order: the first is the oldest.
    if (this.seen.size > SEEN_IDS) this.seen.delete(this.seen.values().next().value as string);

    return false;
  }

  /** The current socket is gone (closed, or dropped as dead): say so and reconnect. */
  private lost(rightAway: boolean): void {
    this.socket = null;
    this.stopHeartbeat();
    this.stopRotation();
    this.setStatus("closed");
    this.openedAt = 0;
    if (!this.explicitlyClosed) this.scheduleReconnect(rightAway);
  }

  /**
   * Drops the socket without waiting for its close event (one whose network died can take a
   * minute to report it) and dials again at once, the backoff reset.
   */
  private reconnectNow(): void {
    const socket = this.socket;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.lost(true);
    socket?.close();
  }

  /** Back from sleep or on another network, a dead socket is replaced now, not at the next stale check. */
  private watchWake(): void {
    if (this.watchingWake) return;
    this.watchingWake = true;

    const wake = () => {
      if (this.socket?.readyState !== WebSocket.OPEN || Date.now() - this.lastMessageAt > WAKE_STALE_MS) {
        this.reconnectNow();
      }
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") wake();
    });
  }

  private send(frame: ClientFrame): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.rawSend(frame);
    } else {
      this.enqueue(frame);
    }
    // A socket rotating in follows the channels too, or it would take over without one.
    const next = this.rotation?.socket;
    if (frame.t !== "pub" && next?.readyState === WebSocket.OPEN) this.rawSend(frame, next);
  }

  /** Sub/unsub are rebuilt from the handlers on open: only publishes wait for it. */
  private enqueue(frame: ClientFrame): void {
    if (frame.t === "pub" && this.sendQueue.push(frame) > MAX_QUEUED) this.sendQueue.shift();
  }

  private rawSend(frame: ClientFrame, socket = this.socket): void {
    try {
      socket?.send(JSON.stringify(frame));
    } catch {
      this.enqueue(frame);
    }
  }

  private scheduleReconnect(rightAway = false): void {
    if (this.reconnectTimer || typeof window === "undefined") return;
    if (this.handlers.size === 0) return; // nothing to reconnect for

    const delay = rightAway
      ? 0
      : Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS) + Math.random() * 250;
    if (!rightAway) this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

      // Nothing back since a ping: dead. Only a ping owes an answer: a hidden tab's timers can
      // sleep a minute, and the quiet that leaves is no sign of a dead socket.
      if (this.lastPingAt > this.lastMessageAt && Date.now() - this.lastMessageAt > STALE_CONNECTION_MS) {
        this.reconnectNow();

        return;
      }
      this.lastPingAt = Date.now();
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
