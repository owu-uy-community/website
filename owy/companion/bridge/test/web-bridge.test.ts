import { afterEach, expect, it, vi } from "vitest";
import { once } from "node:events";
import WebSocket from "ws";
import { z } from "zod";
import { WebTickets, matchesSecret, toolDenial, type WebGrant } from "../src/web/tickets";
import { startWebBridge } from "../src/web/server";
import { DeviceSession, type SharedRuntime } from "../src/index";
import { loadConfig } from "../src/config";
import { createLogger } from "../src/log";
import { BrowserDevice } from "../src/web/device";

const { models } = vi.hoisted(() => ({ models: [] as any[] }));
vi.mock("../src/realtime/session", () => ({
  NodeRealtimeSession: class {
    status = "connected";
    isConnected = true;
    goAwayPending = false;
    sendAudio = vi.fn();
    sendText = vi.fn();
    commitAudio = vi.fn();
    resetConversation = vi.fn();
    close = vi.fn();
    constructor(readonly options: any) {
      models.push(this);
    }
  },
}));
const grant: WebGrant = {
  identity: "admin",
  origin: "http://127.0.0.1:3311",
  writes: false,
  staff: false,
  marketplace: false,
};
const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  models.length = 0;
});
function runtime() {
  const write = vi.fn(async (_input: unknown, _ctx: any) => ({ ok: true }));
  const read = vi.fn(async () => ({ matches: [] }));
  // Modo pitch fakes: the gateway extractor and the site's place-and-create.
  const extract = {
    card: vi.fn(async () => ({
      transcript: "Quiero proponer una charla sobre Effect",
      isPitch: true,
      title: "Effect en producción",
      speaker: null,
      needsTV: false,
      needsWhiteboard: false,
      description: null,
      topics: ["effect"],
    })),
    name: vi.fn(async () => ({ name: "Ana" })),
  };
  const placed = vi.fn(async (input: { title: string; speaker?: string }) => ({
    note: { id: "t1", title: input.title, speaker: input.speaker, room: "Cueva", timeSlot: "15:00 - 15:45" },
    placement: { room: "Cueva", timeSlot: "15:00 - 15:45", reasoning: "Vacío", degraded: false, missing: [], skipped: [] },
  }));
  const shared: SharedRuntime = {
    config: loadConfig({}),
    provider: { provider: "google", spec: "google:test" } as SharedRuntime["provider"],
    definitions: new Map([
      ["create_track", { description: "Write test", inputSchema: z.object({}), execute: write }],
      ["find_track", { description: "Read test", inputSchema: z.object({}), execute: read }],
    ]),
    instructions: "Shared production prompt for both transports",
    gridUrl: "https://owu.uy/conf",
    logger: createLogger("web-test", "error"),
    pitch: {
      extract,
      api: { tracks: { createPlaced: placed, update: vi.fn() } } as unknown as NonNullable<SharedRuntime["pitch"]>["api"],
      openSpaceId: async () => "e1",
      clips: {},
    },
  };
  return { shared, write, read, extract, placed };
}
async function server() {
  const r = runtime();
  const bridge = await startWebBridge(r.shared, { port: 0, origins: [grant.origin] });
  cleanup.push(() => bridge.close());
  return { ...r, bridge };
}
async function ticket(bridge: Awaited<ReturnType<typeof startWebBridge>>, scopes = {}) {
  const response = await fetch(`${bridge.url}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bridge.secret}` },
    body: JSON.stringify({ ...grant, ...scopes }),
  });
  return { response, data: await response.json() };
}
async function browser(scopes = {}) {
  const r = await server();
  const { data } = await ticket(r.bridge, scopes);
  const ws = new WebSocket(data.url, { origin: grant.origin });
  cleanup.push(() => ws.terminate());
  const messages: any[] = [];
  const audio: Buffer[] = [];
  ws.on("message", (bytes, binary) =>
    binary ? audio.push(Buffer.from(bytes as Buffer)) : messages.push(JSON.parse(bytes.toString()))
  );
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "auth", protocol: 1, token: data.token }));
  await vi.waitFor(() => expect(messages.some((m) => m.type === "ready")).toBe(true));
  ws.send(JSON.stringify({ type: "start" }));
  await vi.waitFor(() => expect(messages.some((m) => m.type === "accepted")).toBe(true));
  return { ...r, ws, messages, audio, model: models.at(-1), send: (m: object) => ws.send(JSON.stringify(m)) };
}

it("uses one-use, expiring origin-bound tickets and constant-time secret verification", () => {
  const tickets = new WebTickets();
  const token = tickets.issue(grant, 1000);
  expect(tickets.consume(token, "https://evil.example", 1001)).toBeNull();
  expect(tickets.consume(token, grant.origin, 1001)).toMatchObject(grant);
  expect(tickets.consume(token, grant.origin, 1002)).toBeNull();
  expect(tickets.consume(tickets.issue(grant, 1000), grant.origin, 61000)).toBeNull();
  expect(matchesSecret("test", "test")).toBe(true);
  expect(matchesSecret(undefined, "test")).toBe(false);
  expect(matchesSecret("wrong", "test")).toBe(false);
});
it("fails closed for new/mutating tools and does not equate staff with write consent", () => {
  expect(toolDenial(grant, "show_on_screen")).toBeNull();
  expect(toolDenial(grant, "find_track")).toBeNull();
  expect(toolDenial(grant, "future_tool")).toBeTruthy();
  expect(toolDenial({ ...grant, staff: true }, "create_track")).toBeTruthy();
  expect(toolDenial({ ...grant, writes: true }, "create_track")).toBeNull();
});
it("rejects unauthenticated/cross-origin session issuance and websocket upgrades", async () => {
  const { bridge } = await server();
  const response = await fetch(`${bridge.url}/sessions`, { method: "POST", body: "{}" });
  expect(response.status).toBe(403);
  const cross = await fetch(`${bridge.url}/sessions`, {
    method: "POST",
    headers: { Origin: grant.origin, Authorization: `Bearer ${bridge.secret}` },
    body: "{}",
  });
  expect(cross.status).toBe(403);
  const ws = new WebSocket(bridge.url.replace("http:", "ws:") + "/voice", { origin: "https://evil.example" });
  ws.on("error", () => {});
  const [req, res] = await once(ws, "unexpected-response");
  expect(res.statusCode).toBe(403);
  req.destroy();
  ws.terminate();
});
it("web and gadget adapters receive identical model setup and tool schemas", async () => {
  const r = await browser();
  const gadget = new DeviceSession({ id: "gadget", host: "unused", port: 1, psk: null }, r.shared, {
    connectDevice: async (_spec, handlers) =>
      new BrowserDevice(
        handlers,
        grant,
        () => {},
        () => {}
      ),
  });
  cleanup.push(() => gadget.stop());
  await gadget.start();
  expect(models.at(-1).options.sessionConfig).toEqual(r.model.options.sessionConfig);
  expect(r.messages.find((m) => m.type === "ready")).toMatchObject({
    sampleRate: 16000,
    permissions: { writes: false, staff: false },
    siteConfigured: false,
  });
  expect(r.messages.find((m) => m.type === "ready").tools).toContain("show_on_screen");
});
it("every device owns its stateful provider codec while sharing configuration", async () => {
  const { shared } = runtime();
  shared.createProvider = () => ({ ...shared.provider, model: {} as SharedRuntime["provider"]["model"] });
  for (const id of ["gadget", "browser"]) {
    const session = new DeviceSession({ id, host: "unused", port: 1, psk: null }, shared, {
      connectDevice: async (_spec, handlers) =>
        new BrowserDevice(
          handlers,
          grant,
          () => {},
          () => {}
        ),
    });
    cleanup.push(() => session.stop());
    await session.start();
  }
  expect(models[0].options.provider.model).not.toBe(models[1].options.provider.model);
  expect(models[0].options.sessionConfig).toEqual(models[1].options.sessionConfig);
});
it("sends real PCM and commit into the shared session and waits for playback-ready acknowledgement", async () => {
  const r = await browser();
  const frame = Buffer.alloc(644);
  frame.writeUInt32LE(1, 0);
  r.ws.send(frame);
  await vi.waitFor(() => expect(r.model.sendAudio).toHaveBeenCalledOnce());
  expect(r.model.sendAudio.mock.calls[0][0].length).toBe(640);
  r.send({ type: "commit", run: 1 });
  await vi.waitFor(() => expect(r.model.commitAudio).toHaveBeenCalledOnce());
  r.model.options.onEvent({
    type: "audio-delta",
    responseId: "r1",
    itemId: "i1",
    delta: Buffer.alloc(4800).toString("base64"),
    raw: {},
  });
  r.model.options.onEvent({ type: "response-done", responseId: "r1", status: "completed", raw: {} });
  expect(r.audio).toHaveLength(0);
  r.send({ type: "playbackReady", run: 1 });
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "event" && m.event === "RUN_END")).toBe(true));
  expect(r.audio.reduce((sum, b) => sum + b.length - 4, 0)).toBe(3200);
  expect(r.audio.every((b) => b.readUInt32LE(0) === 1)).toBe(true);
  expect(r.model.resetConversation).not.toHaveBeenCalled();
  r.send({ type: "start" });
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "accepted" && m.run === 2)).toBe(true));
  expect(r.model.resetConversation).not.toHaveBeenCalled();
});
it("a pitch over the web is recorded, not streamed; commit hands it to the extractor and the card lands", async () => {
  const r = await browser({ writes: true });
  // The browser's first (normal) turn is cancelled; the next start is a pitch.
  r.send({ type: "stop" });
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "event" && m.event === "RUN_END")).toBe(true));
  r.send({ type: "start", mode: "pitch" });
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "accepted" && m.run === 2)).toBe(true));
  const frame = Buffer.alloc(644);
  frame.writeUInt32LE(2, 0);
  for (let i = 0; i < 320; i++) frame.writeInt16LE(Math.round(Math.sin(i / 3) * 6000), 4 + i * 2);
  // 2.4 s of voice, paced under the 64 kB/s mic budget.
  for (let i = 0; i < 60; i++) r.ws.send(frame);
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "event" && m.event === "STT_VAD_START")).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  for (let i = 0; i < 60; i++) r.ws.send(frame);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(r.model.sendAudio).not.toHaveBeenCalled();
  r.send({ type: "commit", run: 2 });
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "event" && m.event === "STT_END")).toBe(true));
  r.send({ type: "playbackReady", run: 2 });
  await vi.waitFor(() => expect(r.extract.card).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(r.placed).toHaveBeenCalledOnce());
  expect(r.placed.mock.calls[0][0]).toMatchObject({ openSpaceId: "e1", title: "Effect en producción", source: "companion" });
  await vi.waitFor(() =>
    expect(r.messages.some((m) => m.type === "screen" && m.command?.kind === "card" && m.command.card.room === "Cueva")).toBe(true)
  );
  await vi.waitFor(() => expect(r.model.sendText).toHaveBeenCalledOnce());
  expect(r.model.sendText.mock.calls[0][0]).toMatch(/^\[GUION\] ¡Listo! Tu charla «Effect en producción» queda en Cueva a las 15:00\. ¿Cómo te llamás\?/);
  // The model speaks the script through the normal pipeline; the name invitation follows the announcement.
  r.model.options.onEvent({ type: "audio-delta", responseId: "r1", itemId: "i1", delta: Buffer.alloc(4800).toString("base64"), raw: {} });
  r.model.options.onEvent({ type: "response-done", responseId: "r1", status: "completed", raw: {} });
  await vi.waitFor(() => expect(r.messages.filter((m) => m.type === "event" && m.event === "RUN_END")).toHaveLength(2));
  expect(r.audio.length).toBeGreaterThan(0);
  await vi.waitFor(() =>
    expect(r.messages.some((m) => m.type === "screen" && m.command?.kind === "pitchPrompt" && m.command.prompt === "name")).toBe(true)
  );
});

it("executes shared read/screen/volume tools and blocks real writes without consent", async () => {
  const r = await browser();
  const call = (name: string, args: unknown) => r.model.options.onToolCall({ callId: name, name, args });
  await call("find_track", {});
  expect(r.read).toHaveBeenCalledOnce();
  expect(await call("create_track", {})).toMatchObject({ denied: true });
  expect(r.write).not.toHaveBeenCalled();
  await call("show_on_screen", { kind: "text", text: "Hola desde el bridge" });
  await call("set_volume", { level: 35 });
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "volume" && m.value === 35)).toBe(true));
  expect(r.messages).toContainEqual(
    expect.objectContaining({ type: "screen", command: { kind: "text", text: "Hola desde el bridge" } })
  );
  expect(r.messages.some((m) => m.type === "tool" && m.status === "denied")).toBe(true);
});
it("explicit trusted grants permit real-tool execution but cannot be upgraded through WS controls", async () => {
  const r = await browser({ writes: true, staff: true });
  await r.model.options.onToolCall({ callId: "write", name: "create_track", args: {} });
  expect(r.write).toHaveBeenCalledOnce(); // Stub only: no production write in tests.
  expect(r.write.mock.calls[0][1].session.auth.current.authenticator).toBe("companion-staff");
  const closed = once(r.ws, "close");
  r.send({ type: "staff", value: true });
  const [code] = await closed;
  expect(code).toBe(1008);
});
it("rejects duplicate ownership without releasing the first session; close cleans up the model", async () => {
  const r = await browser();
  const { response } = await ticket(r.bridge);
  expect(response.status).toBe(409);
  r.ws.close();
  await once(r.ws, "close");
  await vi.waitFor(() => expect(r.model.close).toHaveBeenCalledOnce());
  expect((await ticket(r.bridge)).response.status).toBe(200);
});
it("cancel prevents old audio and tool completions from changing a new turn", async () => {
  const r = await browser();
  r.send({ type: "stop" });
  await vi.waitFor(() => expect(r.model.resetConversation).toHaveBeenCalledOnce());
  const output = await r.model.options.onToolCall({ callId: "late", name: "find_track", args: {} });
  expect(output.error).toMatch(/terminó/);
  expect(r.read).not.toHaveBeenCalled();
  r.send({ type: "start" });
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "accepted" && m.run === 2)).toBe(true));
  const stale = Buffer.alloc(644);
  stale.writeUInt32LE(1, 0);
  r.ws.send(stale);
  const current = Buffer.alloc(644);
  current.writeUInt32LE(2, 0);
  r.ws.send(current);
  await vi.waitFor(() => expect(r.model.sendAudio).toHaveBeenCalledTimes(1));
});

// ── Laptop audio: a browser attached as a physical device's mic + speakers ──
function fakeKnob(routes: { mic: "device" | "laptop"; output: "device" | "laptop" }) {
  const handlers: { current?: import("../src/device/esphome").DeviceHandlers } = {};
  const events: string[] = [];
  const deviceAudio: Buffer[] = [];
  const transport = {
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    sendEvent: (event: number) => events.push(String(event)),
    sendAudio: (data: Buffer) => deviceAudio.push(data),
    isPlaybackReady: () => true,
    setFace: vi.fn(),
    setSpeakLevel: vi.fn(),
    showCard: vi.fn(),
    showQr: vi.fn(),
    showText: vi.fn(),
    isStaffMode: () => false,
    isMarketplaceOpen: () => false,
    getVolume: () => 50,
    setVolume: vi.fn(),
    close: vi.fn(),
    getMicSource: () => routes.mic,
    getAudioOutput: () => routes.output,
    setAudioRoute: vi.fn(),
  };
  return { transport, handlers, events, deviceAudio, routes };
}
async function attached(routes: { mic: "device" | "laptop"; output: "device" | "laptop" }) {
  const r = await server();
  const knob = fakeKnob(routes);
  const session = new DeviceSession({ id: "owy-knob", host: "virtual", port: 1, psk: null }, r.shared, {
    connectDevice: async (_spec, handlers) => {
      knob.handlers.current = handlers;
      return knob.transport;
    },
  });
  r.shared.sessions = new Map([[session.id, session]]);
  await session.start();
  cleanup.push(() => session.stop());
  const knobModel = models.at(-1);
  const { data } = await ticket(r.bridge);
  const ws = new WebSocket(data.url, { origin: grant.origin });
  cleanup.push(() => ws.terminate());
  const messages: any[] = [];
  const audio: Buffer[] = [];
  ws.on("message", (bytes, binary) =>
    binary ? audio.push(Buffer.from(bytes as Buffer)) : messages.push(JSON.parse(bytes.toString()))
  );
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "auth", protocol: 1, token: data.token }));
  await vi.waitFor(() => expect(messages.some((m) => m.type === "ready")).toBe(true));
  ws.send(JSON.stringify({ type: "attach", deviceId: "owy-knob" }));
  await vi.waitFor(() => expect(messages.some((m) => m.type === "attached" && m.deviceId === "owy-knob")).toBe(true));
  expect(session.hasPeer).toBe(true);
  return { ...r, knob, session, knobModel, ws, messages, audio, send: (m: object) => ws.send(JSON.stringify(m)) };
}

it("attached browser mirrors the knob's turn: its mic feeds the model and the reply plays in the browser", async () => {
  const r = await attached({ mic: "laptop", output: "laptop" });
  // The knob taps → the bridge accepts on the device AND mirrors `accepted` to the browser.
  await r.knob.handlers.current!.onRequestStart({ start: true } as any);
  expect(r.knob.transport.acceptRequest).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "accepted" && m.run === 1)).toBe(true));
  // Device mic frames are ignored; browser frames (run-tagged) reach the model.
  r.knob.handlers.current!.onAudio({ data: Buffer.alloc(640), end: false });
  const frame = Buffer.alloc(644);
  frame.writeUInt32LE(1, 0);
  r.ws.send(frame);
  await vi.waitFor(() => expect(r.knobModel.sendAudio).toHaveBeenCalledOnce());
  expect(r.knobModel.sendAudio.mock.calls[0][0].length).toBe(640);
  // Model answers: PCM goes to the browser, not the device; events reach both.
  r.knobModel.options.onEvent({ type: "audio-delta", responseId: "r1", itemId: "i1", delta: Buffer.alloc(4800).toString("base64"), raw: {} });
  r.knobModel.options.onEvent({ type: "response-done", responseId: "r1", status: "completed", raw: {} });
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "event" && m.event === "RUN_END")).toBe(true));
  expect(r.audio.reduce((sum, b) => sum + b.length - 4, 0)).toBe(3200);
  expect(r.knob.deviceAudio).toHaveLength(0);
  expect(r.knob.events.length).toBeGreaterThan(0);
  // The browser may not start its own turns while attached.
  r.send({ type: "start" });
  await once(r.ws, "close");
});

it("device mic + browser output, and detaching falls back to device audio", async () => {
  const r = await attached({ mic: "device", output: "laptop" });
  await r.knob.handlers.current!.onRequestStart({ start: true } as any);
  await vi.waitFor(() => expect(r.messages.some((m) => m.type === "accepted")).toBe(true));
  const frame = Buffer.alloc(644);
  frame.writeUInt32LE(1, 0);
  r.ws.send(frame); // browser mic ignored in this mode
  r.knob.handlers.current!.onAudio({ data: Buffer.alloc(640), end: false });
  await vi.waitFor(() => expect(r.knobModel.sendAudio).toHaveBeenCalledOnce());
  r.knobModel.options.onEvent({ type: "audio-delta", responseId: "r1", itemId: "i1", delta: Buffer.alloc(4800).toString("base64"), raw: {} });
  r.knobModel.options.onEvent({ type: "response-done", responseId: "r1", status: "completed", raw: {} });
  await vi.waitFor(() => expect(r.audio.length).toBeGreaterThan(0));
  expect(r.knob.deviceAudio).toHaveLength(0);
  await vi.waitFor(() => expect(r.knob.events.length).toBeGreaterThan(3));
  // Detach: laptop routes are no longer honoured; the device plays.
  r.send({ type: "detach" });
  await vi.waitFor(() => expect(r.session.hasPeer).toBe(false));
  r.audio.length = 0;
  await r.knob.handlers.current!.onRequestStart({ start: true } as any);
  r.knob.handlers.current!.onAudio({ data: Buffer.alloc(640), end: false });
  await vi.waitFor(() => expect(r.knobModel.sendAudio).toHaveBeenCalledTimes(2));
  r.knobModel.options.onEvent({ type: "audio-delta", responseId: "r2", itemId: "i2", delta: Buffer.alloc(4800).toString("base64"), raw: {} });
  r.knobModel.options.onEvent({ type: "response-done", responseId: "r2", status: "completed", raw: {} });
  await vi.waitFor(() => expect(r.knob.deviceAudio.length).toBeGreaterThan(0));
  expect(r.audio).toHaveLength(0);
});
