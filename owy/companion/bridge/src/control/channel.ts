import WebSocket from "ws";
import type { Logger } from "../log";

/**
 * The bridge's line to the site's realtime socket (src/app/api/realtime): the
 * same multiplexed frames the browsers speak (src/lib/realtime/protocol.ts),
 * opened from the Mac with the bridge's API key — a browser can't send headers
 * on a WebSocket, Node can. The site's admin reaches a headless bridge through
 * it; the bridge never listens on the network for that.
 *
 * Vercel recycles a function's socket every ≤5 minutes: a socket that lived
 * a while reconnects at once; one that keeps failing backs off. Silence for
 * 70 s (pings every 25 s) counts as dead.
 */

type ServerFrame =
  | { t: "msg"; ch: string; ev: string; pl: unknown; sid?: string }
  | { t: "ok"; ch: string }
  | { t: "err"; msg: string; ch?: string }
  | { t: "pong" };

export interface ChannelSocket {
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
  /** Every (re)connect, once subscribed: the moment to pull everything again. */
  onOpen?(): void;
  createSocket?: (url: string, headers: Record<string, string>) => ChannelSocket;
  pingEveryMs?: number;
  deadAfterMs?: number;
}

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** A socket that lived this long was recycled, not refused: reconnect at once. */
const HEALTHY_MS = 60_000;

export function realtimeUrl(siteUrl: string): string {
  const site = new URL(siteUrl);
  // `next dev` can't upgrade sockets: locally the realtime lives in the sidecar (pnpm dev:realtime).
  if (["localhost", "127.0.0.1", "::1"].includes(site.hostname)) return "ws://127.0.0.1:3199";
  return `wss://${site.host}/api/realtime`;
}

export class ControlChannel {
  private socket: ChannelSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private openedAt = 0;
  private lastHeardAt = 0;
  private pingTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private forbiddenLogged = false;
  private subscribed = new Set<string>();

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
    if (!this.socket) return false;
    try {
      this.socket.send(JSON.stringify({ t: "pub", ch: channel, ev: event, pl: payload }));
      return true;
    } catch {
      return false;
    }
  }

  private open(): void {
    if (this.stopped || this.socket) return;
    const create = this.options.createSocket ?? ((url, headers) => new WebSocket(url, { headers }) as unknown as ChannelSocket);
    let socket: ChannelSocket;
    try {
      socket = create(this.options.url, { "x-api-key": this.options.apiKey });
    } catch (error) {
      this.options.logger.warn("control: no pude abrir el socket del sitio", error);
      return this.retry();
    }
    this.socket = socket;
    this.subscribed.clear();
    socket.on("open", () => {
      if (this.socket !== socket) return;
      this.openedAt = this.lastHeardAt = Date.now();
      for (const channel of this.options.channels) this.send({ t: "sub", ch: channel });
      this.pingTimer = setInterval(() => this.ping(), this.options.pingEveryMs ?? 25_000);
      this.pingTimer.unref?.();
    });
    socket.on("message", (data) => {
      if (this.socket !== socket) return;
      this.lastHeardAt = Date.now();
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(data)) as ServerFrame;
      } catch {
        return;
      }
      this.onFrame(frame);
    });
    socket.on("error", (error) => {
      if (this.socket === socket) this.options.logger.debug("control: error del socket", error);
    });
    socket.on("close", (code, reason) => {
      if (this.socket !== socket) return;
      const lived = this.openedAt ? Date.now() - this.openedAt : 0;
      this.teardown(null);
      this.options.logger.debug(`control: socket cerrado (${code} ${reason.toString()}), vivió ${Math.round(lived / 1000)} s`);
      if (lived >= HEALTHY_MS) this.attempt = 0;
      this.retry();
    });
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
    if (Date.now() - this.lastHeardAt > (this.options.deadAfterMs ?? 70_000)) {
      this.options.logger.warn("control: el socket del sitio no responde; reconecto");
      this.teardown("stale");
      this.retry();
      return;
    }
    this.send({ t: "ping" });
  }

  private send(frame: object): void {
    try {
      this.socket?.send(JSON.stringify(frame));
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
