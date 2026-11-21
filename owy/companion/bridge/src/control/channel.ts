import WebSocket from "ws";
import type { Logger } from "../log";

/**
 * The bridge's line to the site's realtime socket (src/app/api/realtime): the
 * same multiplexed frames the browsers speak (src/lib/realtime/protocol.ts),
 * opened from the Mac with the bridge's API key — a browser can't send headers
 * on a WebSocket, Node can. The site's admin reaches a headless bridge through
 * it; the bridge never listens on the network for that.
 *
 * Vercel recycles a function's socket every ≤5 minutes. Before that a second
 * socket subscribes every channel and takes over (make before break), so
 * nothing sent around the cut is lost; what both carry is handed over once, by
 * its id. A socket that dies on its own: one that lived a while reconnects at
 * once; one that keeps failing backs off. Silence for 40 s (pings every 15 s)
 * counts as dead.
 */

type ServerFrame =
  | { t: "msg"; ch: string; ev: string; pl: unknown; sid?: string; id?: string }
  | { t: "ok"; ch: string }
  | { t: "err"; msg: string; ch?: string }
  | { t: "pong" };

export interface ChannelSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "open", listener: () => void): unknown;
  on(event: "message", listener: (data: unknown) => void): unknown;
  on(event: "close", listener: (code: number, reason: Buffer) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export interface ControlChannelOptions {
  /** `wss://<site>/api/realtime`, or the dev sidecar (`ws://127.0.0.1:3199`). */
  url: string;
  apiKey: string;
  /** Private channels this key subscribes to (needs `stage:operate`). */
  channels: string[];
  logger: Logger;
  onEvent(channel: string, event: string, payload: unknown): void;
  /** Every (re)connect, once subscribed: the moment to pull everything again. Not a rotation: nothing was missed. */
  onOpen?(): void;
  createSocket?: (url: string, headers: Record<string, string>) => ChannelSocket;
  pingEveryMs?: number;
  deadAfterMs?: number;
}

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** A socket that lived this long was recycled, not refused: reconnect at once. */
const HEALTHY_MS = 60_000;
/** Ahead of Vercel's 300 s cut: when a rotation starts, how long it has to open and then for its acks, the next try after one fails. */
const ROTATE_AFTER_MS = 240_000;
const ROTATE_JITTER_MS = 15_000;
const ROTATE_STEP_MS = 5_000;
const ROTATE_RETRY_MS = 10_000;
/** Ids of the messages handed over last: during a rotation both sockets carry each one. */
const SEEN_IDS = 500;

export function realtimeUrl(siteUrl: string): string {
  const site = new URL(siteUrl);
  // `next dev` can't upgrade sockets: locally the realtime lives in the sidecar (pnpm dev:realtime).
  if (["localhost", "127.0.0.1", "::1"].includes(site.hostname)) return "ws://127.0.0.1:3199";
  return `wss://${site.host}/api/realtime`;
}

export class ControlChannel {
  private socket: ChannelSocket | null = null;
  /** The socket taking over (see ROTATE_AFTER_MS) and the channels it has confirmed. */
  private rotation: { socket: ChannelSocket; subscribed: Set<string> } | null = null;
  private stopped = false;
  private attempt = 0;
  private openedAt = 0;
  private lastHeardAt = 0;
  private pingTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private rotateTimer: NodeJS.Timeout | null = null;
  private forbiddenLogged = false;
  private subscribed = new Set<string>();
  private seen = new Set<string>();

  constructor(private readonly options: ControlChannelOptions) {}

  /** Subscribed to every channel it asked for. */
  get connected(): boolean {
    return this.socket !== null && this.subscribed.size === this.options.channels.length;
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.teardown("bye");
  }

  /** Fire-and-forget publish on a channel this key may publish to (the wall's face frames). */
  publish(channel: string, event: string, payload: unknown): boolean {
    // `ws` drops a send on a socket that isn't open without a word: false has the caller post it instead.
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify({ t: "pub", ch: channel, ev: event, pl: payload }));
      return true;
    } catch {
      return false;
    }
  }

  private open(): void {
    if (this.stopped || this.socket) return;
    let socket: ChannelSocket;
    try {
      socket = this.dial();
    } catch (error) {
      this.options.logger.warn("control: no pude abrir el socket del sitio", error);
      return this.retry();
    }
    this.socket = socket;
    this.subscribed.clear();
  }

  /** A socket wired to this channel: its events count while it is the current one or the one rotating in. */
  private dial(): ChannelSocket {
    const create = this.options.createSocket ?? ((url, headers) => new WebSocket(url, { headers }) as unknown as ChannelSocket);
    const socket = create(this.options.url, { "x-api-key": this.options.apiKey });
    socket.on("open", () => {
      if (socket === this.rotation?.socket) {
        for (const channel of this.options.channels) this.send({ t: "sub", ch: channel }, socket);
        // It takes over once every channel is confirmed, or after ROTATE_STEP_MS anyway.
        if (this.rotateTimer) clearTimeout(this.rotateTimer);
        this.rotateTimer = setTimeout(() => this.promote(), ROTATE_STEP_MS);
        this.rotateTimer.unref?.();
        return;
      }
      if (this.socket !== socket) return;
      this.openedAt = this.lastHeardAt = Date.now();
      for (const channel of this.options.channels) this.send({ t: "sub", ch: channel });
      this.pingTimer = setInterval(() => this.ping(), this.options.pingEveryMs ?? 15_000);
      this.pingTimer.unref?.();
      this.scheduleRotation();
    });
    socket.on("message", (data) => {
      const rotation = socket === this.rotation?.socket ? this.rotation : null;
      if (!rotation && this.socket !== socket) return;
      if (!rotation) this.lastHeardAt = Date.now();
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(data)) as ServerFrame;
      } catch {
        return;
      }
      if (rotation && frame.t !== "msg") this.onRotationFrame(rotation, frame);
      else this.onFrame(frame);
    });
    socket.on("error", (error) => {
      if (this.socket === socket) this.options.logger.debug("control: error del socket", error);
    });
    socket.on("close", (code, reason) => {
      if (socket === this.rotation?.socket) {
        // The current socket carries on; another try comes later.
        this.options.logger.debug(`control: el socket nuevo se cerró antes del relevo (${code} ${reason.toString()})`);
        return this.scheduleRotation(ROTATE_RETRY_MS);
      }
      if (this.socket !== socket) return;
      const lived = this.openedAt ? Date.now() - this.openedAt : 0;
      this.teardown(null);
      this.options.logger.debug(`control: socket cerrado (${code} ${reason.toString()}), vivió ${Math.round(lived / 1000)} s`);
      if (lived >= HEALTHY_MS) this.attempt = 0;
      this.retry();
    });
    return socket;
  }

  /** Make before break: a second socket subscribes every channel and takes over once it has them all. */
  private rotate(): void {
    this.rotateTimer = null;
    // Not open: the close path reconnects (and that socket rotates in turn).
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.rotation = { socket: this.dial(), subscribed: new Set() };
    } catch (error) {
      this.options.logger.debug("control: no pude abrir el socket nuevo", error);
      return this.scheduleRotation(ROTATE_RETRY_MS);
    }
    // Not open by then: dropped, and tried again later.
    this.rotateTimer = setTimeout(() => this.scheduleRotation(ROTATE_RETRY_MS), ROTATE_STEP_MS);
    this.rotateTimer.unref?.();
  }

  /** The new socket's answers: once every channel is confirmed it takes over; a refusal fails the rotation. */
  private onRotationFrame(rotation: { subscribed: Set<string> }, frame: ServerFrame): void {
    if (frame.t === "err") {
      this.options.logger.debug(`control: el socket nuevo no pudo suscribirse (${frame.msg})`);
      return this.scheduleRotation(ROTATE_RETRY_MS);
    }
    if (frame.t !== "ok") return;
    rotation.subscribed.add(frame.ch);
    if (rotation.subscribed.size === this.options.channels.length) this.promote();
  }

  /** The new socket becomes the current one and the old one goes. No onOpen: nothing was missed. */
  private promote(): void {
    const rotation = this.rotation;
    if (!rotation) return;
    const old = this.socket;
    this.rotation = null;
    this.socket = rotation.socket;
    this.subscribed = rotation.subscribed;
    this.openedAt = this.lastHeardAt = Date.now();
    this.scheduleRotation();
    this.options.logger.debug("control: socket renovado sin corte");
    try {
      old?.close(1000, "rotated");
    } catch {
      // already closed
    }
  }

  /** The next rotation (or another try): one in flight is dropped, the current socket carries on. */
  private scheduleRotation(delayMs = ROTATE_AFTER_MS + Math.random() * ROTATE_JITTER_MS): void {
    this.stopRotation();
    this.rotateTimer = setTimeout(() => this.rotate(), delayMs);
    this.rotateTimer.unref?.();
  }

  private stopRotation(): void {
    if (this.rotateTimer) clearTimeout(this.rotateTimer);
    this.rotateTimer = null;
    const socket = this.rotation?.socket;
    this.rotation = null;
    try {
      socket?.close(1000, "rotation dropped");
    } catch {
      // already closed
    }
  }

  /** True for a message already handed over (both sockets carry it during a rotation). No id (an older site): never. */
  private seenBefore(id: string | undefined): boolean {
    if (!id) return false;
    if (this.seen.has(id)) return true;
    this.seen.add(id);
    // A Set keeps insertion order: the first is the oldest.
    if (this.seen.size > SEEN_IDS) this.seen.delete(this.seen.values().next().value as string);
    return false;
  }

  private onFrame(frame: ServerFrame): void {
    switch (frame.t) {
      case "ok":
        this.subscribed.add(frame.ch);
        if (this.connected) {
          this.attempt = 0;
          this.forbiddenLogged = false;
          this.options.logger.info(`control: conectado al sitio (${this.options.channels.join(", ")})`);
          this.options.onOpen?.();
        }
        return;
      case "err":
        if (frame.msg === "forbidden") {
          if (!this.forbiddenLogged)
            this.options.logger.error(
              `control: el sitio no deja suscribirse a ${frame.ch ?? "?"}: la clave del bridge necesita stage:operate (preset «companion»)`
            );
          this.forbiddenLogged = true;
          // Retrying fast can't fix a key: close and come back slowly.
          this.attempt = BACKOFF_MS.length - 1;
          this.teardown("forbidden");
          this.retry();
        }
        return;
      case "msg":
        if (this.seenBefore(frame.id)) return;
        try {
          this.options.onEvent(frame.ch, frame.ev, frame.pl);
        } catch (error) {
          this.options.logger.error(`control: ${frame.ch}/${frame.ev} falló`, error);
        }
        return;
      case "pong":
        return;
    }
  }

  private ping(): void {
    if (Date.now() - this.lastHeardAt > (this.options.deadAfterMs ?? 40_000)) {
      this.options.logger.warn("control: el socket del sitio no responde; reconecto");
      this.teardown("stale");
      this.retry();
      return;
    }
    this.send({ t: "ping" });
  }

  private send(frame: object, socket = this.socket): void {
    try {
      socket?.send(JSON.stringify(frame));
    } catch {
      // the close handler reconnects
    }
  }

  private retry(): void {
    if (this.stopped || this.retryTimer) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
    this.retryTimer.unref?.();
  }

  private teardown(reason: string | null): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.stopRotation();
    const socket = this.socket;
    this.socket = null;
    this.subscribed.clear();
    if (socket && reason !== null) {
      try {
        socket.close(1000, reason);
      } catch {
        // already closed
      }
    }
  }
}
