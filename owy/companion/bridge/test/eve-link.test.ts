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
      auth: req.headers.authorization ?? null,
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
    const link = new EveLink({ url: eve.url, basic: { username: "u", password: "p" }, logger });
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
    expect(post.auth).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
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
