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

export interface NodeRealtimeSessionOptions {
  provider: RealtimeProvider;
  sessionConfig: RealtimeSessionConfig;
  onToolCall: ToolCallHandler;
  /** Every normalized server event, after the session's own bookkeeping ran. */
  onEvent?: (event: RealtimeServerEvent) => void;
  onError?: (error: Error) => void;
  onClose?: (info: { code?: number; reason?: string }) => void;
  logger: Logger;
  createWebSocket?: WebSocketFactory;
  /** Lifetime requested for each minted token (seconds). */
  tokenTtlSeconds?: number;
  /** How long `connect()` waits for the provider's session-created handshake. */
  connectTimeoutMs?: number;
}

export type SessionStatus = "disconnected" | "connecting" | "connected" | "error";

const defaultWebSocketFactory: WebSocketFactory = (url, protocols) =>
  new WebSocket(url, protocols) as unknown as WebSocketLike;

export class NodeRealtimeSession {
  private readonly provider: RealtimeProvider;
  private readonly baseConfig: RealtimeSessionConfig;
  private readonly onToolCall: ToolCallHandler;
  private readonly onEvent?: (event: RealtimeServerEvent) => void;
  private readonly onError?: (error: Error) => void;
  private readonly onClose?: (info: { code?: number; reason?: string }) => void;
  private readonly log: Logger;
  private readonly createWebSocket: WebSocketFactory;
  private readonly tokenTtlSeconds: number;
  private readonly connectTimeoutMs: number;

  private ws: WebSocketLike | null = null;
  private connectionEpoch = 0;
  private sendQueue: Promise<void> = Promise.resolve();
  private _status: SessionStatus = "disconnected";
  private inflightConnect: Promise<void> | null = null;

  // Provider-side continuity (Gemini `sessionResumptionUpdate` / `goAway`).
  private _resumptionHandle: string | null = null;
  private _goAwayPending = false;

  // Tool-call bookkeeping, mirrored from the SDK session.
  private toolCallsInResponse = new Set<string>();
  private submittedToolOutputs = new Set<string>();
  private responseToolCallsClosed = false;
  private pendingToolRuns = new Set<Promise<void>>();

  constructor(options: NodeRealtimeSessionOptions) {
    this.provider = options.provider;
    this.baseConfig = options.sessionConfig;
    this.onToolCall = options.onToolCall;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
    this.onClose = options.onClose;
    this.log = options.logger;
    this.createWebSocket = options.createWebSocket ?? defaultWebSocketFactory;
    this.tokenTtlSeconds = options.tokenTtlSeconds ?? 300;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
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

  /** Session config for this connection: the base config plus the resumption handle when we have one. */
  currentConfig(): RealtimeSessionConfig {
    if (this._resumptionHandle === null) return this.baseConfig;
    return {
      ...this.baseConfig,
      providerOptions: {
        ...(this.baseConfig.providerOptions ?? {}),
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

  private async connectInternal(): Promise<void> {
    if (this.ws) this.teardownSocket();
    const epoch = ++this.connectionEpoch;
    this._status = "connecting";
    this._goAwayPending = false;
    this.resetToolBookkeeping();

    const config = this.currentConfig();
    const token = await this.provider.getToken(config, this.tokenTtlSeconds);
    if (epoch !== this.connectionEpoch) throw new Error("realtime connection cancelled");
    const wsConfig = this.provider.model.getWebSocketConfig({ token: token.token, url: token.url });
    const ws = this.createWebSocket(wsConfig.url, wsConfig.protocols);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.fail(new Error(`realtime: timeout esperando session-created (${this.connectTimeoutMs} ms)`));
        reject(new Error("realtime connect timeout"));
      }, this.connectTimeoutMs);

      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
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
        this.fail(error);
        settle(error);
      };
      ws.onclose = (event) => {
        if (this.ws !== ws) return;
        const reason = typeof event.reason === "string" ? event.reason : event.reason?.toString("utf8");
        this.log.info(`ws closed code=${event.code ?? "?"} reason=${reason ?? ""}`);
        this.ws = null;
        this._status = "disconnected";
        settle(new Error(`realtime: socket cerrado antes de session-created (${event.code ?? "?"})`));
        this.onClose?.({ code: event.code, reason });
      };
    });
  }

  private connectSettle: ((error?: Error) => void) | null = null;

  /** Closes the socket and reconnects, carrying the resumption handle (Gemini) when available. */
  async reconnect(): Promise<void> {
    await this.whenSettled();
    this.log.info(`reconnecting (handle=${this._resumptionHandle ? "yes" : "no"})`);
    this.teardownSocket();
    await this.connect();
  }

  close(): void {
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

  /** Marks the end of the current input audio stream (Gemini `audioStreamEnd`). */
  commitAudio(): void {
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
      parsed = this.provider.model.parseServerEvent(raw);
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
        this._status = "connected";
        this.connectSettle?.();
        this.connectSettle = null;
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
