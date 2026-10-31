import WebSocket from "ws";
import type {
  Experimental_RealtimeClientEvent as RealtimeClientEvent,
  Experimental_RealtimeServerEvent as RealtimeServerEvent,
  Experimental_RealtimeSessionConfig as RealtimeSessionConfig,
} from "ai";
import type { Logger } from "../log";
import type { RealtimeProvider } from "./models";

/**
 * Node-side realtime session.
 *
 * The AI SDK's `Experimental_AbstractRealtimeSession` is browser-only (it
 * fetches a token endpoint and plays audio through `AudioContext`). This class
 * keeps the SDK's *bookkeeping* — session-update on open, immediate
 * function-call outputs, a single deferred `response-create`, keepalive
 * replies, `null` serializations dropped, array server events — but drives
 * the provider's realtime model as a pure codec over a `ws` socket, which is
 * the documented Node pattern.
 *
 * Audio in/out is left to the caller: feed `sendAudio(pcm16)` and consume
 * `audio-delta` events via `onEvent`.
 */

export interface ToolCall {
  callId: string;
  name: string;
  args: unknown;
}

export type ToolCallHandler = (call: ToolCall) => Promise<unknown> | unknown;

/** Minimal socket surface so tests can inject a fake. Mirrors the browser/`ws` event-property API. */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string | Buffer }) => void) | null;
}

export type WebSocketFactory = (url: string, protocols?: string[]) => WebSocketLike;

/** One way to reach a realtime model: the provider's codec and the session config it gets. */
export interface RealtimeTier {
  provider: RealtimeProvider;
  sessionConfig: RealtimeSessionConfig;
}

export interface NodeRealtimeSessionOptions {
  provider: RealtimeProvider;
  sessionConfig: RealtimeSessionConfig;
  /**
   * Tried in order when the primary (provider + sessionConfig) cannot connect.
   * The gateway has no realtime fallbacks of its own (the model is fixed in the
   * socket URL and tokens are single-use), so failover lives here.
   */
  fallbacks?: RealtimeTier[];
  /** A tier that failed to connect is skipped for this long (unless every tier is down). */
  tierCooldownMs?: number;
  /**
   * Appended to the instructions at every connect: the gateway cannot resume a
   * session, so a fresh one learns the conversation so far this way.
   */
  instructionsSuffix?: () => string;
  onToolCall: ToolCallHandler;
  /** Every normalized server event, after the session's own bookkeeping ran. */
  onEvent?: (event: RealtimeServerEvent) => void;
  /** A *connected* socket broke. Failed connection attempts are not reported here: they move to the next tier. */
  onError?: (error: Error) => void;
  /** A *connected* socket closed. */
  onClose?: (info: { code?: number; reason?: string }) => void;
  logger: Logger;
  createWebSocket?: WebSocketFactory;
  /** Lifetime requested for each minted token (seconds). */
  tokenTtlSeconds?: number;
  /** How long minting a token may take; a hung HTTPS call must not hold a tap. */
  tokenTimeoutMs?: number;
  /** How long `connect()` waits for the provider's session-created handshake, per tier. */
  connectTimeoutMs?: number;
}

/** A provider that answers session-created before it applied session-update (OpenAI) gets this long to reject the config. */
const CONFIG_CONFIRM_GRACE_MS = 1_500;

export type SessionStatus = "disconnected" | "connecting" | "connected" | "error";

const defaultWebSocketFactory: WebSocketFactory = (url, protocols) =>
  new WebSocket(url, protocols) as unknown as WebSocketLike;

export class NodeRealtimeSession {
  private readonly tiers: RealtimeTier[];
  /** Per tier: until when it is skipped after failing to connect. */
  private readonly downUntil: number[];
  private readonly tierCooldownMs: number;
  private readonly instructionsSuffix?: () => string;
  private tierIndex = 0;
  private readonly onToolCall: ToolCallHandler;
  private readonly onEvent?: (event: RealtimeServerEvent) => void;
  private readonly onError?: (error: Error) => void;
  private readonly onClose?: (info: { code?: number; reason?: string }) => void;
  private readonly log: Logger;
  private readonly createWebSocket: WebSocketFactory;
  private readonly tokenTtlSeconds: number;
  private readonly tokenTimeoutMs: number;
  private readonly connectTimeoutMs: number;

  private ws: WebSocketLike | null = null;
  private parseServerEvent: (raw: unknown) => RealtimeServerEvent | RealtimeServerEvent[] = (raw) =>
    this.provider.model.parseServerEvent(raw);
  private connectionEpoch = 0;
  /** Bumped by close(): a connect in flight was cancelled by the caller, not failed by the tier. */
  private generation = 0;
  private sendQueue: Promise<void> = Promise.resolve();
  private _status: SessionStatus = "disconnected";
  private inflightConnect: Promise<void> | null = null;
  private _connectedAt = 0;
  private _lastConnectMs: number | null = null;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;

  // Provider-side continuity (Gemini `sessionResumptionUpdate` / `goAway`).
  private _resumptionHandle: string | null = null;
  private _goAwayPending = false;

  // Tool-call bookkeeping, mirrored from the SDK session.
  private toolCallsInResponse = new Set<string>();
  private submittedToolOutputs = new Set<string>();
  private responseToolCallsClosed = false;
  private pendingToolRuns = new Set<Promise<void>>();

  constructor(options: NodeRealtimeSessionOptions) {
    this.tiers = [{ provider: options.provider, sessionConfig: options.sessionConfig }, ...(options.fallbacks ?? [])];
    this.downUntil = this.tiers.map(() => 0);
    this.tierCooldownMs = options.tierCooldownMs ?? 180_000;
    this.instructionsSuffix = options.instructionsSuffix;
    this.onToolCall = options.onToolCall;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
    this.onClose = options.onClose;
    this.log = options.logger;
    this.createWebSocket = options.createWebSocket ?? defaultWebSocketFactory;
    this.tokenTtlSeconds = options.tokenTtlSeconds ?? 300;
    this.tokenTimeoutMs = options.tokenTimeoutMs ?? 8_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
  }

  /** The tier this session is on (or last tried). */
  get tier(): RealtimeTier {
    return this.tiers[this.tierIndex];
  }

  get provider(): RealtimeProvider {
    return this.tier.provider;
  }

  private get baseConfig(): RealtimeSessionConfig {
    return this.tier.sessionConfig;
  }

  /** `<provider>:<model>` of the current tier, for logs and the settings UI. */
  get tierSpec(): string {
    return this.provider.spec;
  }

  /** When the current socket reached "connected" (ms epoch); 0 when not connected. */
  get connectedAt(): number {
    return this._status === "connected" ? this._connectedAt : 0;
  }

  /** How long the last successful connect took, token included. */
  get lastConnectMs(): number | null {
    return this._lastConnectMs;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get resumptionHandle(): string | null {
    return this._resumptionHandle;
  }

  /** True once the provider announced it will close the socket soon; reconnect between turns. */
  get goAwayPending(): boolean {
    return this._goAwayPending;
  }

  get isConnected(): boolean {
    return this._status === "connected" && this.ws !== null;
  }

  /**
   * Session config for this connection: the base config plus the resumption handle when we have one.
   * Only when the base config opted into resumption (direct Google): the gateway also sends handles
   * but closes 1008 "transform rejected frame" on a setup that carries `sessionResumption`.
   */
  currentConfig(): RealtimeSessionConfig {
    const suffix = this.instructionsSuffix?.() ?? "";
    const base = suffix ? { ...this.baseConfig, instructions: `${this.baseConfig.instructions ?? ""}${suffix}` } : this.baseConfig;
    const resumable = (base.providerOptions as { sessionResumption?: unknown } | undefined)?.sessionResumption;
    if (this._resumptionHandle === null || !resumable) return base;
    return {
      ...base,
      providerOptions: {
        ...(base.providerOptions ?? {}),
        sessionResumption: { handle: this._resumptionHandle },
      },
    };
  }

  // ── Connection ──────────────────────────────────────────────────────────

  /** Resolves once any in-flight `connect()` has settled (never throws). */
  async whenSettled(): Promise<void> {
    if (this.inflightConnect) await this.inflightConnect.catch(() => {});
  }

  async connect(): Promise<void> {
    if (this.inflightConnect) return this.inflightConnect;
    this.inflightConnect = this.connectInternal().finally(() => {
      this.inflightConnect = null;
    });
    return this.inflightConnect;
  }

  /**
   * Walks the tiers in order, skipping the ones that failed recently (unless
   * all did: never give up for good), and stays on the first that connects.
   */
  private async connectInternal(): Promise<void> {
    const generation = this.generation;
    const now = Date.now();
    const all = this.tiers.map((_, index) => index);
    const ready = all.filter((index) => this.downUntil[index] <= now);
    const order = ready.length > 0 ? ready : all;
    let lastError: unknown = new Error("realtime: sin modelos configurados");
    for (const [position, index] of order.entries()) {
      const spec = this.tiers[index].provider.spec;
      const started = Date.now();
      try {
        await this.connectTier(index);
        this.downUntil[index] = 0;
        this._lastConnectMs = Date.now() - started;
        if (index > 0) this.log.warn(`realtime: en el respaldo ${spec} (conectó en ${this._lastConnectMs} ms)`);
        else this.log.info(`realtime: ${spec} conectado en ${this._lastConnectMs} ms`);
        return;
      } catch (error) {
        // The caller closed or reset the session: not this tier's fault.
        if (generation !== this.generation) throw error;
        lastError = error;
        this.teardownSocket();
        this.downUntil[index] = Date.now() + this.tierCooldownMs;
        const next = order[position + 1];
        this.log.warn(
          `realtime: ${spec} no conectó (${(error instanceof Error ? error.message : String(error)).split("\n")[0]}); ${
            next === undefined ? "sin más respaldos" : `pruebo ${this.tiers[next].provider.spec}`
          }`
        );
      }
    }
    this._status = "error";
    throw lastError;
  }

  private async connectTier(index: number): Promise<void> {
    if (this.ws) this.teardownSocket();
    const epoch = ++this.connectionEpoch;
    // A resumption handle belongs to the tier that issued it.
    if (index !== this.tierIndex) this._resumptionHandle = null;
    this.tierIndex = index;
    this._status = "connecting";
    this._goAwayPending = false;
    this.resetToolBookkeeping();

    const config = this.currentConfig();
    const token = await withTimeout(
      this.provider.getToken(config, this.tokenTtlSeconds),
      this.tokenTimeoutMs,
      `el token tardó más de ${this.tokenTimeoutMs} ms`
    );
    if (epoch !== this.connectionEpoch) throw new Error("realtime connection cancelled");
    // Optional since provider spec v4.0.15 (server-websocket / WebRTC models skip it).
    const wsConfig = this.provider.model.getWebSocketConfig?.({ token: token.token, url: token.url }) ?? {
      url: token.url,
    };
    const ws = this.createWebSocket(wsConfig.url, wsConfig.protocols);
    this.ws = ws;
    // Per-connection parser when the provider offers one (stateful turn tracking must not leak across reconnects).
    this.parseServerEvent =
      this.provider.model.createServerEventParser?.() ?? ((raw) => this.provider.model.parseServerEvent(raw));

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.clearConfirmTimer();
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(
        () => settle(new Error(`timeout esperando la sesión (${this.connectTimeoutMs} ms)`)),
        this.connectTimeoutMs
      );
      this.connectSettle = settle;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.log.debug("ws open; sending session-update");
        void this.send({ type: "session-update", config });
      };
      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        void this.handleRawMessage(event.data);
      };
      ws.onerror = (event) => {
        if (this.ws !== ws) return;
        const error = event instanceof Error ? event : new Error("realtime: WebSocket error");
        // A live socket broke: the caller's turn needs to know. While connecting, the tier just failed.
        if (this._status === "connected") this.fail(error);
        settle(error);
      };
      ws.onclose = (event) => {
        if (this.ws !== ws) return;
        const wasConnected = this._status === "connected";
        const reason = typeof event.reason === "string" ? event.reason : event.reason?.toString("utf8");
        this.log.info(`ws closed code=${event.code ?? "?"} reason=${reason ?? ""}`);
        this.ws = null;
        this._status = "disconnected";
        settle(new Error(`socket cerrado antes de conectar (${event.code ?? "?"}${reason ? ` ${reason}` : ""})`));
        if (wasConnected) this.onClose?.({ code: event.code, reason });
      };
    });
  }

  private connectSettle: ((error?: Error) => void) | null = null;

  private markConnected(): void {
    if (this._status !== "connecting") return;
    this.clearConfirmTimer();
    this._status = "connected";
    this._connectedAt = Date.now();
    this.connectSettle?.();
    this.connectSettle = null;
  }

  private clearConfirmTimer(): void {
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.confirmTimer = null;
  }

  /** Closes the socket and reconnects, carrying the resumption handle (Gemini) when available. */
  async reconnect(): Promise<void> {
    await this.whenSettled();
    this.log.info(`reconnecting (handle=${this._resumptionHandle ? "yes" : "no"})`);
    this.teardownSocket();
    await this.connect();
  }

  close(): void {
    this.generation++;
    this.teardownSocket();
    this._status = "disconnected";
  }

  /** Aborted turns must not resume an in-progress Gemini response. */
  resetConversation(): void {
    this.close();
    this._resumptionHandle = null;
    this._goAwayPending = false;
    this.resetToolBookkeeping();
  }

  private teardownSocket(): void {
    this.connectionEpoch++;
    this.clearConfirmTimer();
    this.connectSettle?.(new Error("realtime connection closed"));
    this.connectSettle = null;
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    // Keep no-op handlers: `ws` emits 'error' when a CONNECTING socket is closed,
    // and an unhandled 'error' event crashes the process.
    ws.onerror = () => {};
    ws.onclose = () => {};
    try {
      ws.close(1000, "bye");
    } catch {
      // already closed
    }
  }

  private fail(error: Error): void {
    this._status = "error";
    this.log.error("realtime error", error);
    this.onError?.(error);
  }

  // ── Sending ─────────────────────────────────────────────────────────────

  /** Serializes through the provider codec; `null` means the provider has no such event (dropped). */
  send(event: RealtimeClientEvent): Promise<void> {
    const ws = this.ws;
    const run = async () => {
      if (!ws || this.ws !== ws) {
        this.log.debug(`drop ${event.type}: no socket`);
        return;
      }
      const serialized = await this.provider.model.serializeClientEvent(event);
      if (this.ws !== ws) return;
      if (serialized == null) {
        this.log.debug(`drop ${event.type}: provider no-op`);
        return;
      }
      ws.send(JSON.stringify(serialized));
    };
    this.sendQueue = this.sendQueue.then(run, run).catch((error) => {
      this.log.warn(`send ${event.type} failed`, error);
    });
    return this.sendQueue;
  }

  /** Appends a chunk of PCM16 input audio (rate = sessionConfig.inputAudioFormat.rate). */
  sendAudio(pcm16: Buffer): void {
    if (pcm16.length === 0) return;
    void this.send({ type: "input-audio-append", audio: pcm16.toString("base64") });
  }

  /**
   * Marks the end of the current input audio stream (Gemini `audioStreamEnd`).
   * Not on server-VAD tiers (OpenAI): the server already committed the buffer,
   * and a second commit is an "empty buffer" error.
   */
  commitAudio(): void {
    if (this.baseConfig.turnDetection) return;
    void this.send({ type: "input-audio-commit" });
  }

  /** Sends a user text message and requests a response (no-op request on Gemini, needed on OpenAI). */
  sendText(text: string): void {
    void this.send({ type: "conversation-item-create", item: { type: "text-message", role: "user", text } });
    void this.send({ type: "response-create" });
  }

  cancelResponse(): void {
    void this.send({ type: "response-cancel" });
  }

  // ── Receiving ───────────────────────────────────────────────────────────

  private async handleRawMessage(data: unknown): Promise<void> {
    const text = toText(data);
    if (text === null) return;

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      this.log.warn("non-JSON frame ignored");
      return;
    }

    const health = this.provider.model.getHealthCheckResponse?.(raw);
    if (health != null && this.ws) {
      this.ws.send(JSON.stringify(health));
      return;
    }

    let parsed: RealtimeServerEvent | RealtimeServerEvent[];
    try {
      parsed = this.parseServerEvent(raw);
    } catch (error) {
      this.log.warn("parseServerEvent failed", error);
      return;
    }
    for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
      this.handleServerEvent(event);
    }
  }

  private handleServerEvent(event: RealtimeServerEvent): void {
    switch (event.type) {
      case "session-created":
        if (this._status !== "connecting") break;
        // OpenAI answers session-created before it applied our session-update: give it a
        // moment to reject the config (error) or confirm it (session-updated).
        if (this.provider.confirmsConfig) {
          this.clearConfirmTimer();
          this.confirmTimer = setTimeout(() => this.markConnected(), CONFIG_CONFIRM_GRACE_MS);
        } else this.markConnected();
        break;

      case "session-updated":
        this.markConnected();
        break;

      case "function-call-arguments-done": {
        this.toolCallsInResponse.add(event.callId);
        const run = this.executeToolCall(event.callId, event.name, event.arguments).finally(() => {
          this.pendingToolRuns.delete(run);
        });
        this.pendingToolRuns.add(run);
        break;
      }

      case "response-done":
        this.responseToolCallsClosed = true;
        this.maybeRequestToolResponse();
        break;

      case "custom":
        this.handleCustomEvent(event.rawType, event.raw);
        break;

      case "error":
        this.log.warn(`provider error: ${event.message}${event.code ? ` (${event.code})` : ""}`);
        // During the handshake an error means this tier rejected us (e.g. the config): try the next one.
        if (this._status === "connecting") {
          this.connectSettle?.(new Error(`${event.message}${event.code ? ` (${event.code})` : ""}`));
          this.connectSettle = null;
          return;
        }
        break;

      default:
        break;
    }
    this.onEvent?.(event);
  }

  private handleCustomEvent(rawType: string, raw: unknown): void {
    if (rawType === "goAway") {
      this._goAwayPending = true;
      const timeLeft = (raw as { goAway?: { timeLeft?: string } })?.goAway?.timeLeft;
      this.log.info(`provider goAway (timeLeft=${timeLeft ?? "?"})`);
      return;
    }
    if (rawType === "sessionResumptionUpdate") {
      const update = (raw as { sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean } })
        ?.sessionResumptionUpdate;
      if (update?.resumable && update.newHandle) {
        this._resumptionHandle = update.newHandle;
        this.log.debug("resumption handle updated");
      }
    }
  }

  private async executeToolCall(callId: string, name: string, rawArguments: string): Promise<void> {
    const ws = this.ws;
    let args: unknown = {};
    let parseError: string | null = null;
    if (rawArguments.trim().length > 0) {
      try {
        args = JSON.parse(rawArguments);
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }
    }

    let output: unknown;
    if (parseError) {
      output = { error: `Argumentos inválidos: ${parseError}` };
    } else {
      try {
        output = (await this.onToolCall({ callId, name, args })) ?? {};
      } catch (error) {
        output = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    if (this.ws !== ws) return;
    // Outputs go back immediately (the SDK does the same); the single
    // response-create waits until the response is closed and complete.
    await this.send({
      type: "conversation-item-create",
      item: { type: "function-call-output", callId, name, output: JSON.stringify(output) },
    });
    if (this.ws !== ws) return;
    this.submittedToolOutputs.add(callId);
    this.maybeRequestToolResponse();
  }

  private maybeRequestToolResponse(): void {
    if (!this.responseToolCallsClosed) return;
    if (this.toolCallsInResponse.size === 0) {
      this.resetToolBookkeeping();
      return;
    }
    for (const callId of this.toolCallsInResponse) {
      if (!this.submittedToolOutputs.has(callId)) return;
    }
    this.resetToolBookkeeping();
    void this.send({ type: "response-create" });
  }

  private resetToolBookkeeping(): void {
    this.toolCallsInResponse.clear();
    this.submittedToolOutputs.clear();
    this.responseToolCallsClosed = false;
  }

  /** Test/diagnostic helper: resolves once in-flight tool executions have been reported back. */
  async settleToolCalls(): Promise<void> {
    while (this.pendingToolRuns.size > 0) {
      await Promise.all([...this.pendingToolRuns]);
    }
    await this.sendQueue;
  }
}

function toText(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data) && data.every((part) => Buffer.isBuffer(part))) {
    return Buffer.concat(data as Buffer[]).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  return null;
}

/** Rejects after `ms`; the slow promise's late outcome is ignored (Promise.race keeps it handled). */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
