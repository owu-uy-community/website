import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
const here = fileURLToPath(new URL(".", import.meta.url)),
  root = resolve(here, "../../..");
const require = createRequire(join(root, "package.json"));
const { build } = require("esbuild");
const output = resolve(here, "../.eve/web-preview");
mkdirSync(output, { recursive: true });
await build({
  entryPoints: [join(here, "preview.tsx")],
  bundle: true,
  outfile: join(output, "preview.js"),
  jsx: "automatic",
  loader: { ".css": "local-css" },
  define: { "process.env.NODE_ENV": '"development"' },
});
await build({
  entryPoints: [join(root, "src/lib/companion/voice-bridge.server.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(output, "voice-server.mjs"),
});
const voice = await import(pathToFileURL(join(output, "voice-server.mjs")).href);
const quota = new voice.VoiceQuota();
const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owy · Companion lab (local fixtures)</title><link rel="stylesheet" href="/preview.css"><style>body{margin:0}button,input,select{color:inherit}</style><div id="root"></div><script src="/preview.js"></script></html>';
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (!["127.0.0.1:3311", "localhost:3311"].includes(req.headers.host)) {
    res.writeHead(403).end();
    return;
  }
  if (path === "/api/companion/voice-session" && req.method === "POST") {
    let response;
    try {
      let request = new Request(`http://${req.headers.host}${path}`, {
        method: "POST",
        headers: new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === "string")),
      });
      voice.assertVoiceRequest(request);
      if (Number(req.headers["content-length"] || 0) > 1024) throw new voice.VoiceHttpError(413, "Request too large.");
      if (process.env.COMPANION_WEB_VOICE !== "1")
        throw new voice.VoiceHttpError(
          503,
          "Start the local preview with COMPANION_WEB_VOICE=1 and the companion bridge with COMPANION_WEB_BRIDGE=1."
        );
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 1024) throw new voice.VoiceHttpError(413, "Request too large.");
      }
      request = new Request(request, { body: body || "{}" });
      const scopes = await voice.readVoiceScopes(request);
      let connection;
      try {
        connection =
          process.env.COMPANION_BRIDGE_URL && process.env.COMPANION_BRIDGE_SECRET
            ? { url: process.env.COMPANION_BRIDGE_URL, secret: process.env.COMPANION_BRIDGE_SECRET }
            : JSON.parse(readFileSync(join(here, "../.eve/web-bridge.json"), "utf8"));
      } catch {
        throw new voice.VoiceHttpError(503, "Start the companion bridge with COMPANION_WEB_BRIDGE=1 first.");
      }
      quota.take("loopback");
      response = voice.voiceResponse(
        await voice.requestBridgeTicket("local-preview", `http://${req.headers.host}`, scopes, connection)
      );
    } catch (error) {
      response = voice.voiceFailure(error);
    }
    req.resume();
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  if (path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html);
    return;
  }
  // Fixed allowlist: no arbitrary filesystem paths and no API proxy.
  const files = {
    "/preview.js": [join(output, "preview.js"), "text/javascript"],
    "/preview.css": [join(output, "preview.css"), "text/css"],
    "/companion-audio/capture.worklet.js": [join(root, "public/companion-audio/capture.worklet.js"), "text/javascript"],
    "/companion-audio/pcm.mjs": [join(root, "public/companion-audio/pcm.mjs"), "text/javascript"],
  };
  for (const name of [
    "owy-runtime.mjs",
    "owy-runtime.wasm",
    "manifest.json",
    "worker.mjs",
    "session.mjs",
    "pose.mjs",
    "fixtures.mjs",
    "bridge.mjs",
  ])
    files["/companion-runtime/" + name] = [
      join(root, "public/companion-runtime", name),
      name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".json") ? "application/json" : "text/javascript",
    ];
  const file = files[path];
  if (!file || !existsSync(file[0])) {
    res.writeHead(404).end();
    return;
  }
  res
    .writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" })
    .end(readFileSync(file[0]));
});
server.listen(3311, "127.0.0.1", () =>
  console.log(
    `Companion lab: http://127.0.0.1:3311 · fixtures + ${process.env.COMPANION_WEB_VOICE === "1" ? "real bridge voice (explicit permissions)" : "voice disabled"}`
  )
);
server.requestTimeout = 15000;
server.headersTimeout = 5000;
