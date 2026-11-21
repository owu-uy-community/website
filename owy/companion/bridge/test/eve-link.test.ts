import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/log";
import { EveLink } from "../src/realtime/eve-link";

interface FakeEve {
  url: string;
  requests: { method: string; url: string; body: unknown; auth: string | null }[];
  close(): Promise<void>;
}

/** The voice channel as the bridge sees it: accept a turn, then stream one NDJSON turn and stay open. */
function fakeEve(events: object[], opts: { streamIndex?: number } = {}): Promise<FakeEve> {
  const requests: FakeEve["requests"] = [];
  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method ?? "",
      url: req.url ?? "",
      body: raw ? JSON.parse(raw) : null,
      auth: (req.headers["x-api-key"] as string | undefined) ?? null,
    });
    if (req.method === "POST" && req.url?.endsWith("/turns")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ sessionId: "wrun_test", streamIndex: opts.streamIndex ?? 0 }));
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/companion/sessions/wrun_test/stream")) {
      res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8" });
      for (const event of events) res.write(`${JSON.stringify(event)}\n`);
      // eve keeps the session stream open after `session.waiting`; the client must not wait for EOF.
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, status: "accepted" }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

const logger = createLogger("test", "error");
let eve: FakeEve | null = null;
afterEach(async () => {
  await eve?.close();
  eve = null;
});

describe("EveLink", () => {
  it("sends the utterance with the device's staff/marketplace state and returns the final message", async () => {
    eve = await fakeEve(
      [
        { type: "turn.started", data: { turnId: "turn_0" } },
        { type: "message.appended", data: { messageDelta: "Dejame " } },
        { type: "message.appended", data: { messageDelta: "ver." } },
        { type: "message.completed", data: { finishReason: "tool-calls", message: "Dejame ver." } },
        { type: "actions.requested", data: { actions: [{ toolName: "find_free_slot", kind: "tool-call" }] } },
        { type: "action.result", data: { result: { kind: "tool-result", toolName: "find_free_slot", output: {} } } },
        { type: "message.appended", data: { messageDelta: "Hay lugar en Cueva " } },
        { type: "message.appended", data: { messageDelta: "a las quince y treinta." } },
        { type: "message.completed", data: { finishReason: "stop", message: "Hay lugar en Cueva a las quince y treinta." } },
        { type: "turn.completed", data: { turnId: "turn_0" } },
        { type: "session.waiting", data: { continuationToken: "owy-knob" } },
      ],
      { streamIndex: 12 }
    );
    const link = new EveLink({ url: eve.url, apiKey: "owy_test", logger });
    const deltas: string[] = [];
    const tools: string[] = [];

    const result = await link.turn("owy-knob", "hay lugar para una charla de lambdas?", {
      staff: true,
      marketplaceOpen: true,
      eventName: "OWU Conf 2026",
      onDelta: (text) => deltas.push(text),
      onTool: (name) => tools.push(name),
    });

    expect(result).toEqual({
      sessionId: "wrun_test",
      text: "Hay lugar en Cueva a las quince y treinta.",
      interim: ["Dejame ver."],
    });
    expect(deltas).toEqual(["Dejame ", "Dejame ver.", "Hay lugar en Cueva ", "Hay lugar en Cueva a las quince y treinta."]);
    expect(tools).toEqual(["find_free_slot"]);

    const [post, stream] = eve.requests;
    expect(post.url).toBe("/companion/owy-knob/turns");
    expect(post.body).toEqual({
      text: "hay lugar para una charla de lambdas?",
      staff: true,
      marketplaceOpen: true,
      eventName: "OWU Conf 2026",
    });
    expect(post.auth).toBe("owy_test");
    expect(stream.url).toBe("/companion/sessions/wrun_test/stream?startIndex=12");
  });

  it("cancels the eve turn and answers for the voice when the agent asks for human input", async () => {
    eve = await fakeEve([
      { type: "turn.started", data: {} },
      { type: "input.requested", data: { requests: [{ kind: "question" }] } },
    ]);
    const link = new EveLink({ url: eve.url, logger });

    const result = await link.turn("owy-knob", "cargá la charla", { staff: false, marketplaceOpen: true });

    expect(result.text).toMatch(/staff/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(eve.requests.map((r) => `${r.method} ${r.url}`)).toContain("POST /companion/owy-knob/cancel");
  });

  it("a pitch turn carries the card the bridge made and keeps to its own time budget", async () => {
    eve = await fakeEve([
      { type: "turn.started", data: {} },
      { type: "message.completed", data: { finishReason: "stop", message: "Qué lindo tema, Ana." } },
      { type: "session.waiting", data: {} },
    ]);
    const link = new EveLink({ url: eve.url, logger });
    const pitch = { title: "Effect", speaker: "Ana", needsTV: false, needsWhiteboard: false, description: null, topics: ["effect"] };

    const result = await link.turn("owy-knob", "soy Ana y quiero hablar de Effect", {
      staff: false,
      marketplaceOpen: false,
      kind: "pitch",
      pitch,
      timeoutMs: 5000,
    });

    expect(result.text).toBe("Qué lindo tema, Ana.");
    expect(eve.requests[0].body).toMatchObject({ kind: "pitch", pitch });

    // A stream that never ends is cut by the per-call budget, not the link's 90 s default.
    await eve.close();
    eve = await fakeEve([{ type: "turn.started", data: {} }]);
    const slow = new EveLink({ url: eve.url, logger });
    await expect(slow.turn("owy-knob", "hola", { staff: false, marketplaceOpen: false, timeoutMs: 50 })).rejects.toThrow();
  });

  it("surfaces a failed turn as an error and honours an external abort", async () => {
    eve = await fakeEve([{ type: "turn.failed", data: { code: "model_error", message: "boom" } }]);
    const link = new EveLink({ url: eve.url, logger });
    await expect(link.turn("owy-knob", "hola", { staff: false, marketplaceOpen: false })).rejects.toThrow(/boom/);

    await eve.close();
    eve = await fakeEve([{ type: "turn.started", data: {} }]); // never completes
    const slow = new EveLink({ url: eve.url, logger });
    const abort = new AbortController();
    const pending = slow.turn("owy-knob", "hola", { staff: false, marketplaceOpen: false, signal: abort.signal });
    setTimeout(() => abort.abort(), 30);
    await expect(pending).rejects.toThrow();
  });
});

/** eve 1.0's stream (v27), one session event per line as the companion channel serializes them. */
const at = (line: number, index = 0) => ({ position: { line, index }, at: "2026-11-01T22:00:00.000Z" });
describe("EveLink on eve 1.0 (stream v27)", () => {
  it("captions the reply as it streams, reports tools, and answers with the reply parts", async () => {
    eve = await fakeEve(
      [
        { type: "delivery.admitted", data: { deliveryId: "d_1" }, meta: at(7) },
        { type: "turn.started", scope: { turnId: "turn_3" }, data: { turnId: "turn_3" }, meta: at(8) },
        { type: "content.delta", scope: { turnId: "turn_3" }, data: { partId: "p0", kind: "reasoning", delta: "pienso" }, meta: at(8) },
        { type: "content.delta", scope: { turnId: "turn_3" }, data: { partId: "p1", kind: "text", delta: "Dejame " }, meta: at(8) },
        { type: "content.delta", scope: { turnId: "turn_3" }, data: { partId: "p1", delta: "ver." }, meta: at(8) },
        { type: "content.completed", scope: { turnId: "turn_3" }, data: { partId: "p1", kind: "text", phase: "narration", value: "Dejame ver." }, meta: at(9) },
        { type: "call.requested", scope: { turnId: "turn_3" }, data: { callId: "c1", capability: { kind: "tool", name: "find_free_slot" }, input: {} }, meta: at(9) },
        { type: "call.settled", scope: { turnId: "turn_3" }, data: { callId: "c1", outcome: "completed", output: {} }, meta: at(10) },
        { type: "content.delta", scope: { turnId: "turn_3" }, data: { partId: "p2", kind: "text", delta: "Hay lugar en Cueva " }, meta: at(10) },
        { type: "content.delta", scope: { turnId: "turn_3" }, data: { partId: "p2", delta: "a las quince." }, meta: at(10) },
        { type: "content.completed", scope: { turnId: "turn_3" }, data: { partId: "p2", kind: "text", phase: "reply", value: "Hay lugar en Cueva a las quince." }, meta: at(11) },
        { type: "turn.settled", scope: { turnId: "turn_3" }, data: { turnId: "turn_3", outcome: "completed", reply: ["p2"] }, meta: at(11) },
        { type: "delivery.settled", data: { deliveryId: "d_1", outcome: "handled", turnId: "turn_3" }, meta: at(11, 1) },
      ],
      { streamIndex: 7 }
    );
    const link = new EveLink({ url: eve.url, logger });
    const deltas: string[] = [];
    const tools: string[] = [];
    const result = await link.turn("owy-knob", "¿hay lugar a las tres?", {
      staff: false,
      marketplaceOpen: true,
      onDelta: (text) => deltas.push(text),
      onTool: (name) => tools.push(name),
    });
    expect(result.text).toBe("Hay lugar en Cueva a las quince.");
    expect(result.interim).toEqual(["Dejame ver."]);
    expect(tools).toEqual(["find_free_slot"]);
    expect(deltas).not.toContain("pienso");
    expect(deltas.at(-1)).toBe("Hay lugar en Cueva a las quince.");
    expect(eve.requests[1].url).toBe("/companion/sessions/wrun_test/stream?startIndex=7");
  });

  it("a failed turn is an error, and the budget prompt starts a fresh session", async () => {
    eve = await fakeEve([
      { type: "turn.settled", data: { turnId: "t", outcome: "failed", error: { code: "model_error", message: "boom" } }, meta: at(3) },
    ]);
    await expect(new EveLink({ url: eve.url, logger }).turn("owy-knob", "hola", { staff: false, marketplaceOpen: false })).rejects.toThrow(/boom/);

    await eve.close();
    eve = await fakeEve([
      { type: "interaction.opened", data: { interactionId: "i1", subject: { turnId: "t" }, request: { kind: "budget", prompt: "¿Seguimos?" } }, meta: at(4) },
    ]);
    await expect(new EveLink({ url: eve.url, logger }).turn("owy-knob", "hola", { staff: false, marketplaceOpen: false, timeoutMs: 2000 })).rejects.toThrow(/sesión nueva/);
    expect(eve.requests.map((r) => `${r.method} ${r.url}`)).toContain("POST /companion/owy-knob/reset");
  });
});

describe("EveLink deadlines", () => {
  it("a POST that never answers counts toward the turn deadline", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const link = new EveLink({
      url: "http://eve.invalid",
      logger: createLogger("test", "error"),
      fetch: hanging,
      turnTimeoutMs: 50,
    });
    const started = Date.now();
    await expect(link.turn("knob", "hola", { staff: false, marketplaceOpen: false })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("EveLink memory", () => {
  it("a session at its token cap is retired and the question asked again on a fresh one", async () => {
    const calls: string[] = [];
    let turns = 0;
    const fake: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname.endsWith("/turns")) {
        turns++;
        return Response.json({ sessionId: `s${turns}`, streamIndex: 0 });
      }
      if (url.pathname.endsWith("/reset")) return Response.json({ ok: true });
      // eve's per-session token guardrail parks the turn on an Approve/Stop prompt nobody can answer by voice.
      const events =
        turns === 1
          ? [{ type: "input.requested", data: { requests: [{ kind: "session-limit", requestId: "s1:limit:input:500001" }] } }]
          : [
              { type: "message.completed", data: { message: "La charla de Effect es a las tres.", finishReason: "stop" } },
              { type: "session.waiting" },
            ];
      return new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(""));
    };
    const link = new EveLink({ url: "http://eve.test", logger: createLogger("test", "error"), fetch: fake });
    const result = await link.turn("knob", "¿A qué hora es Effect?", { staff: false, marketplaceOpen: false });
    expect(result.text).toBe("La charla de Effect es a las tres.");
    expect(calls).toEqual([
      "POST /companion/knob/turns",
      "GET /companion/sessions/s1/stream",
      "POST /companion/knob/reset",
      "POST /companion/knob/turns",
      "GET /companion/sessions/s2/stream",
    ]);
  });
});
