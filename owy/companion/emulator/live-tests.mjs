import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CapturePCM, pcmLevel } from "../../../public/companion-audio/pcm.mjs";
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const require = createRequire(resolve(root, "package.json"));
const { build } = require("esbuild");
async function moduleFor(file) {
  const r = await build({
    entryPoints: [resolve(root, file)],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
}
const server = await moduleFor("src/lib/companion/voice-bridge.server.ts");
const { WebVoice } = await moduleFor("src/components/Companion/web-voice.ts");
test("voice issuance requires exact browser origin and JSON", () => {
  const request = (headers) => new Request("https://owu.uy/api/companion/voice-token", { method: "POST", headers });
  assert.throws(() => server.assertVoiceRequest(request({})), /origin/);
  assert.throws(
    () => server.assertVoiceRequest(request({ origin: "https://evil.example", "content-type": "application/json" })),
    /origin/
  );
  assert.throws(
    () => server.assertVoiceRequest(request({ origin: "https://owu.uy", "content-type": "text/plain" })),
    /JSON/
  );
  server.assertVoiceRequest(
    request({ origin: "https://owu.uy", "content-type": "application/json", "sec-fetch-site": "same-origin" })
  );
});
test("web server brokers a bridge ticket with server credentials and explicit scopes, never a provider setup", async () => {
  let body, headers, url;
  const token = await server.requestBridgeTicket(
    "admin",
    "https://owu.uy",
    { writes: false, staff: false, marketplace: false },
    { url: "http://127.0.0.1:3312", secret: "private-test-key" },
    async (u, o) => {
      url = u;
      headers = o.headers;
      body = JSON.parse(o.body);
      return Response.json({
        protocol: 1,
        token: "x".repeat(43),
        url: "ws://127.0.0.1:3312/voice",
        expiresAt: Date.now() + 300000,
      });
    }
  );
  assert.equal(url.href, "http://127.0.0.1:3312/sessions");
  assert.equal(headers.Authorization, "Bearer private-test-key");
  assert.deepEqual(body, {
    identity: "admin",
    origin: "https://owu.uy",
    writes: false,
    staff: false,
    marketplace: false,
  });
  assert(!JSON.stringify(token).includes("private-test-key"));
});
test("bridge failures never echo secrets or upstream bodies", async () => {
  const scopes = { writes: false, staff: false, marketplace: false };
  await assert.rejects(server.requestBridgeTicket("admin", "https://owu.uy", scopes, {}), /configured/);
  await assert.rejects(
    server.requestBridgeTicket(
      "admin",
      "https://owu.uy",
      scopes,
      { url: "http://localhost:3312", secret: "private-value" },
      async () => new Response("private-value upstream failure", { status: 500 })
    ),
    (e) => !e.message.includes("private-value") && e.status === 502
  );
  const r = server.voiceFailure(new Error("secret"));
  assert(!JSON.stringify(await r.json()).includes("secret"));
  assert.match(r.headers.get("cache-control"), /no-store/);
});
test("only bounded explicit boolean scopes are accepted; no prompt, model, device or tool override", async () => {
  const request = (body) =>
    new Request("https://owu.uy/api/companion/voice-session", { method: "POST", body: JSON.stringify(body) });
  assert.deepEqual(await server.readVoiceScopes(request({})), { writes: false, staff: false, marketplace: false });
  assert.deepEqual(await server.readVoiceScopes(request({ staff: true })), {
    writes: false,
    staff: true,
    marketplace: false,
  });
  for (const body of [{ staff: "true" }, { model: "other" }, { deviceId: "physical" }, { prompt: "override" }, []])
    await assert.rejects(server.readVoiceScopes(request(body)), /Invalid voice permissions/);
  await assert.rejects(server.readVoiceScopes(request({ unknown: "a".repeat(2048) })), /large/);
});
test("issuance quota bounds rapid retries and hourly sessions", () => {
  const q = new server.VoiceQuota();
  for (let i = 0; i < 3; i++) q.take("admin", 1000);
  assert.throws(() => q.take("admin", 1000), /wait/);
  q.take("admin", 61001);
  const hourly = new server.VoiceQuota();
  for (let i = 0; i < 20; i++) hourly.take("admin", i * 61000);
  assert.throws(() => hourly.take("admin", 20 * 61000), /wait/);
});
test("capture resamples 44.1/48 kHz into exact 20 ms little-endian 16 kHz frames", () => {
  for (const rate of [44100, 48000]) {
    const pcm = new CapturePCM(rate),
      frames = [];
    const samples = Float32Array.from({ length: rate }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 440 * i) / rate));
    for (let i = 0; i < samples.length; i += 128) pcm.push(samples.subarray(i, i + 128), (b) => frames.push(b));
    assert.equal(frames.length, 50);
    assert(frames.every((b) => b.byteLength === 640));
    assert(pcmLevel(frames[5]) > 0.2 && pcmLevel(frames[5]) < 0.35);
    const one = new CapturePCM(rate),
      whole = [];
    one.push(samples, (b) => whole.push(Buffer.from(b)));
    assert.deepEqual(
      frames.map((b) => Buffer.from(b)),
      whole
    );
  }
});
test("invalid capture values become bounded silence rather than NaN PCM", () => {
  const pcm = new CapturePCM(16000),
    frames = [];
  pcm.push(new Float32Array(320).fill(NaN), (b) => frames.push(b));
  assert.equal(pcmLevel(frames[0]), 0);
});
const context = () => ({
  resume: async () => {},
  close: async () => {},
  audioWorklet: { addModule: async () => {} },
  createGain: () => ({
    gain: { value: 0 },
    connect() {
      return this;
    },
  }),
  createAnalyser: () => ({
    fftSize: 256,
    connect() {
      return this;
    },
  }),
});
test("permission denial ends cleanly without requesting a provider token", async () => {
  let tokens = 0;
  const states = [];
  const voice = new WebVoice(
    (s) => states.push(s),
    () => {},
    () => {},
    {
      context,
      media: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
      ticket: async () => {
        tokens++;
      },
      socket: () => {
        throw Error("unexpected");
      },
    }
  );
  await voice.start();
  assert.equal(tokens, 0);
  assert.equal(voice.status.stage, "error");
  assert.match(voice.status.message, /permission/);
  voice.stop();
});
test("ending while permission is pending stops a late microphone stream", async () => {
  let resolveMedia,
    stops = 0,
    tokens = 0;
  const media = new Promise((r) => (resolveMedia = r));
  const voice = new WebVoice(
    () => {},
    () => {},
    () => {},
    {
      context,
      media: () => media,
      ticket: async () => {
        tokens++;
      },
      socket: () => {
        throw Error("unexpected");
      },
    }
  );
  const start = voice.start();
  await new Promise((r) => setTimeout(r, 0));
  voice.stop();
  resolveMedia({ getTracks: () => [{ stop: () => stops++ }] });
  await start;
  assert.equal(stops, 1);
  assert.equal(tokens, 0);
  assert.equal(voice.status.stage, "off");
});
test("duplicate Resume does not acquire twice; Mute cancels pending reacquisition", async () => {
  let resolveMedia,
    requests = 0,
    stops = 0;
  const media = new Promise((r) => (resolveMedia = r));
  const voice = new WebVoice(
    () => {},
    () => {},
    () => {},
    {
      context,
      media: () => {
        requests++;
        return media;
      },
      ticket: async () => {},
      socket: () => {},
    }
  );
  voice.stopped = false;
  voice.ctx = context();
  voice.socket = { readyState: 1, bufferedAmount: 0, send() {}, close() {} };
  const first = voice.resume(),
    second = voice.resume();
  await new Promise((r) => setTimeout(r, 0));
  voice.mute();
  resolveMedia({ getTracks: () => [{ stop: () => stops++ }] });
  await Promise.all([first, second]);
  assert.equal(requests, 1);
  assert.equal(stops, 1);
  assert.equal(voice.status.stage, "muted");
  voice.stop();
});

function playbackHarness() {
  const sent = [],
    nodes = [],
    commands = [],
    visuals = [];
  const track = {
    enabled: false,
    readyState: "live",
    stop() {
      this.readyState = "ended";
    },
  };
  const ctx = {
    ...context(),
    currentTime: 0,
    createBuffer: (_channels, count, rate) => ({
      duration: count / rate,
      getChannelData: () => new Float32Array(count),
    }),
    createBufferSource: () => {
      const node = { connect() {}, disconnect() {}, start() {}, stop() {}, onended: null };
      nodes.push(node);
      return node;
    },
  };
  const voice = new WebVoice(
    () => {},
    (s) => visuals.push(s),
    () => {},
    {
      context: () => ctx,
      media: async () => {
        throw Error("Unexpected mic acquisition");
      },
      ticket: async () => {},
      socket: () => {},
    },
    (c) => commands.push(c)
  );
  voice.ctx = ctx;
  voice.gain = {};
  voice.stopped = false;
  voice.bridgeReady = true;
  voice.stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  voice.socket = {
    readyState: 1,
    bufferedAmount: 0,
    send: (data) => sent.push(typeof data === "string" ? JSON.parse(data) : data),
    close() {},
  };
  voice.status.stage = "connecting";
  voice.receive({ type: "accepted", run: 1 });
  const pcm = new ArrayBuffer(1028);
  new DataView(pcm).setUint32(0, 1, true);
  return { voice, track, sent, nodes, commands, visuals, pcm };
}
test("browser acknowledges real STT_END before playing tagged 16 kHz bridge PCM", () => {
  const h = playbackHarness();
  try {
    h.track.enabled = true;
    h.voice.receive({ type: "event", event: "STT_END", run: 1 });
    assert.equal(h.track.enabled, false);
    assert.deepEqual(h.sent.at(-1), { type: "playbackReady", run: 1 });
    h.voice.play(h.pcm);
    assert.equal(h.nodes[0].buffer.duration, 0.032);
    h.voice.receive({ type: "event", event: "RUN_END", run: 1 });
    assert.equal(h.voice.status.stage, "speaking");
    assert.equal(h.sent.filter((m) => m.type === "start").length, 0);
  } finally {
    h.voice.stop();
  }
});
test("follow-up is requested only after browser playback drains, using another bridge turn", async () => {
  const h = playbackHarness();
  try {
    h.voice.receive({ type: "event", event: "STT_END", run: 1 });
    h.voice.play(h.pcm);
    h.voice.receive({ type: "event", event: "RUN_END", run: 1 });
    assert.equal(h.sent.filter((m) => m.type === "start").length, 0);
    h.nodes[0].onended();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(h.sent.filter((m) => m.type === "start").length, 1);
    assert.equal(h.voice.status.stage, "connecting");
    h.voice.receive({ type: "accepted", run: 2 });
    h.voice.play(h.pcm); // stale run 1 must not restart old audio
    assert.equal(h.nodes.length, 1);
    assert.equal(h.voice.status.stage, "listening");
  } finally {
    h.voice.stop();
  }
});
test("shared bridge silent RUN_END releases input; privacy rejects late acceptance", () => {
  const h = playbackHarness();
  try {
    h.voice.receive({ type: "event", event: "RUN_END", run: 1 });
    assert.equal(h.track.readyState, "ended");
    assert.equal(h.voice.status.stage, "idle");
    h.voice.status.stage = "connecting";
    h.voice.syncDevice({ privacy: 1, quiet: 0, volume: 65, continuous: 1 }, true, false);
    assert.equal(h.voice.status.stage, "muted");
    h.voice.receive({ type: "accepted", run: 2 });
    assert.equal(h.voice.status.stage, "muted");
    assert(h.sent.some((m) => m.type === "stop"));
  } finally {
    h.voice.stop();
  }
});
test("tool and screen diagnostics are bounded and stale-run messages cannot change the virtual device", () => {
  const h = playbackHarness();
  try {
    h.voice.receive({ type: "screen", command: { kind: "text", text: "stale" }, run: 0 });
    assert.equal(h.commands.length, 0);
    h.voice.receive({ type: "screen", command: { kind: "text", text: "current" }, run: 1 });
    assert.equal(h.commands[0].text, "current");
    for (let i = 0; i < 100; ++i) h.voice.receive({ type: "tool", name: "find_track", status: "done", run: 1 });
    assert.equal(h.voice.status.tools.length, 40);
  } finally {
    h.voice.stop();
  }
});
