import type {
  Experimental_RealtimeClientEvent as RealtimeClientEvent,
  Experimental_RealtimeModel as RealtimeModel,
  Experimental_RealtimeServerEvent as RealtimeServerEvent,
} from "ai";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/log";
import type { RealtimeProvider } from "../src/realtime/models";
import { NodeRealtimeSession, type WebSocketLike } from "../src/realtime/session";

/**
 * A fake provider that mimics the Google mapper's behaviour closely enough:
 * `response-create` / `response-cancel` serialize to null (dropped), server
 * frames can fan out into several normalized events, pings get pongs.
 */
class FakeModel implements RealtimeModel {
  readonly specificationVersion = "v4" as const;
  readonly provider = "fake";
  readonly modelId = "fake-live";
  async doCreateClientSecret() {
    return { token: "t", url: "wss://fake" };
  }
  getWebSocketConfig({ token, url }: { token: string; url: string }) {
    return { url: `${url}?access_token=${token}` };
  }
  parseServerEvent(raw: unknown): RealtimeServerEvent | RealtimeServerEvent[] {
    const frame = raw as Record<string, unknown>;
    if (frame.setupComplete) return { type: "session-created", raw };
    if (frame.toolCall) {
      const call = frame.toolCall as { id: string; name: string; args: string };
      return [
        { type: "function-call-arguments-delta", responseId: "r1", itemId: "i1", callId: call.id, delta: call.args, raw },
        { type: "function-call-arguments-done", responseId: "r1", itemId: "i1", callId: call.id, name: call.name, arguments: call.args, raw },
      ];
    }
    if (frame.turnComplete) return { type: "response-done", responseId: "r1", status: "completed", raw };
    if (frame.goAway) return { type: "custom", rawType: "goAway", raw };
    if (frame.sessionResumptionUpdate) return { type: "custom", rawType: "sessionResumptionUpdate", raw };
    if (frame.audio) return { type: "audio-delta", responseId: "r1", itemId: "i1", delta: frame.audio as string, raw };
    return { type: "custom", rawType: "unknown", raw };
  }
  serializeClientEvent(event: RealtimeClientEvent): unknown {
    switch (event.type) {
      case "session-update":
        return { setup: { providerOptions: event.config.providerOptions ?? null } };
      case "input-audio-append":
        return { realtimeInput: { audio: event.audio } };
      case "input-audio-commit":
        return { realtimeInput: { audioStreamEnd: true } };
      case "conversation-item-create":
        if (event.item.type === "function-call-output") {
          return { toolResponse: { id: event.item.callId, name: event.item.name, output: event.item.output } };
        }
        if (event.item.type === "text-message") return { realtimeInput: { text: event.item.text } };
        return null;
      default:
        return null;
    }
  }
  buildSessionConfig() {
    return {};
  }
  getHealthCheckResponse(raw: unknown) {
    return (raw as { ping?: boolean }).ping ? { pong: true } : null;
  }
}

class FakeSocket implements WebSocketLike {
  sent: unknown[] = [];
  closed = false;
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onerror: WebSocketLike["onerror"] = null;
  onclose: WebSocketLike["onclose"] = null;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.onclose?.({ code: 1000, reason: "closed" });
  }
  /** Test helper: deliver a server frame (as a binary Buffer, like Gemini does). */
  receive(frame: unknown) {
    this.onmessage?.({ data: Buffer.from(JSON.stringify(frame)) });
  }
  open() {
    this.onopen?.({});
  }
}

function setup(options: { onToolCall?: (call: { name: string; args: unknown }) => unknown } = {}) {
  const sockets: FakeSocket[] = [];
  const getToken = vi.fn(async () => ({ token: `tok${sockets.length + 1}`, url: "wss://fake" }));
  const provider: RealtimeProvider = {
    spec: "fake:fake-live",
    provider: "google",
    modelId: "fake-live",
    model: new FakeModel(),
    getToken,
  };
  const events: RealtimeServerEvent[] = [];
  const session = new NodeRealtimeSession({
    provider,
    sessionConfig: { instructions: "hola", providerOptions: { sessionResumption: {} } },
    logger: createLogger("test", "error"),
    onToolCall: options.onToolCall ?? (() => ({ ok: true })),
    onEvent: (event) => events.push(event),
    createWebSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      queueMicrotask(() => {
        socket.open();
        socket.receive({ setupComplete: {} });
      });
      return socket;
    },
  });
  return { session, sockets, events, getToken };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("NodeRealtimeSession", () => {
  it("connects, sends session-update on open and resolves on session-created", async () => {
    const { session, sockets } = setup();
    await session.connect();
    expect(session.status).toBe("connected");
    expect(sockets[0].url).toBe("wss://fake?access_token=tok1");
    expect(sockets[0].sent[0]).toEqual({ setup: { providerOptions: { sessionResumption: {} } } });
  });

  it("answers tool calls immediately and drops provider no-ops", async () => {
    const onToolCall = vi.fn(async ({ name, args }: { name: string; args: unknown }) => ({ echoed: name, args }));
    const { session, sockets } = setup({ onToolCall });
    await session.connect();
    const socket = sockets[0];

    socket.receive({ toolCall: { id: "call-1", name: "get_board", args: JSON.stringify({ a: 1 }) } });
    await session.settleToolCalls();

    expect(onToolCall).toHaveBeenCalledWith({ callId: "call-1", name: "get_board", args: { a: 1 } });
    const toolResponse = socket.sent.find((m) => (m as { toolResponse?: unknown }).toolResponse) as {
      toolResponse: { id: string; name: string; output: string };
    };
    expect(toolResponse.toolResponse.id).toBe("call-1");
    expect(JSON.parse(toolResponse.toolResponse.output)).toEqual({ echoed: "get_board", args: { a: 1 } });

    // response-create after response-done is a null serialization → never on the wire.
    socket.receive({ turnComplete: true });
    await flush();
    expect(socket.sent.some((m) => JSON.stringify(m).includes("response"))).toBe(false);
  });

  it("reports invalid tool arguments back instead of crashing", async () => {
    const onToolCall = vi.fn();
    const { session, sockets } = setup({ onToolCall });
    await session.connect();
    sockets[0].receive({ toolCall: { id: "call-2", name: "x", args: "{not json" } });
    await session.settleToolCalls();
    expect(onToolCall).not.toHaveBeenCalled();
    const toolResponse = sockets[0].sent.find((m) => (m as { toolResponse?: unknown }).toolResponse) as {
      toolResponse: { output: string };
    };
    expect(JSON.parse(toolResponse.toolResponse.output).error).toMatch(/Argumentos inválidos/);
  });

  it("dispatches fan-out events, keepalives and audio", async () => {
    const { session, sockets, events } = setup();
    await session.connect();
    sockets[0].receive({ ping: true });
    expect(sockets[0].sent.at(-1)).toEqual({ pong: true });
    sockets[0].receive({ audio: "AAAA" });
    expect(events.at(-1)?.type).toBe("audio-delta");
    session.sendAudio(Buffer.from([1, 2, 3, 4]));
    await flush();
    expect(sockets[0].sent.at(-1)).toEqual({ realtimeInput: { audio: Buffer.from([1, 2, 3, 4]).toString("base64") } });
  });

  it("tracks goAway and resumption handles and reconnects with a fresh token", async () => {
    const { session, sockets, getToken } = setup();
    await session.connect();
    sockets[0].receive({ sessionResumptionUpdate: { newHandle: "h-42", resumable: true } });
    sockets[0].receive({ goAway: { timeLeft: "10s" } });
    expect(session.goAwayPending).toBe(true);
    expect(session.resumptionHandle).toBe("h-42");

    await session.reconnect();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(sockets[0].closed).toBe(true);
    expect(session.goAwayPending).toBe(false);
    expect(sockets[1].sent[0]).toEqual({ setup: { providerOptions: { sessionResumption: { handle: "h-42" } } } });
    expect(session.isConnected).toBe(true);
  });

  it("drops queued microphone audio when an aborted turn starts a fresh session", async () => {
    const { session, sockets } = setup();
    await session.connect();
    sockets[0].receive({ sessionResumptionUpdate: { newHandle: "old-turn", resumable: true } });
    session.sendAudio(Buffer.alloc(1024));
    session.resetConversation();
    await session.connect();
    await flush();
    expect(session.resumptionHandle).toBeNull();
    expect(sockets[1].sent.some(m => (m as { realtimeInput?: unknown }).realtimeInput)).toBe(false);
    session.close();
  });

  it("does not send an old tool result into the next connection", async () => {
    let resolveTool!: (value: unknown) => void;
    const { session, sockets } = setup({ onToolCall: () => new Promise(resolve => { resolveTool = resolve; }) });
    await session.connect();
    sockets[0].receive({ toolCall: { id: "old-call", name: "get_board", args: "{}" } });
    session.resetConversation();
    await session.connect();
    resolveTool({ oldResult: true });
    await session.settleToolCalls();
    expect(sockets[1].sent.some(m => (m as { toolResponse?: unknown }).toolResponse)).toBe(false);
    session.close();
  });

  it("settles a cancelled connection immediately instead of leaving its handshake timer alive", async () => {
    const session = new NodeRealtimeSession({
      provider: {
        spec: "fake:fake-live", provider: "google", modelId: "fake-live", model: new FakeModel(),
        getToken: async () => ({ token: "test", url: "wss://fake" }),
      },
      sessionConfig: {}, logger: createLogger("test", "error"), onToolCall: () => ({}),
      createWebSocket: url => new FakeSocket(url),
    });
    const connection = session.connect();
    const rejected = expect(connection).rejects.toThrow("connection closed");
    await flush();
    session.close();
    await rejected;
    expect(session.status).toBe("disconnected");
  });
});
