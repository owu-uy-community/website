import { createServer, type IncomingMessage } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { DeviceSession, type SharedRuntime } from "../index";
import type { Logger } from "../log";
import { BrowserDevice } from "./device";
import { matchesSecret, toolDenial, WebTickets, WEB_SESSION_MS, type WebGrant } from "./tickets";

export type WebBridgeOptions = { port: number; origins: string[]; secret?: string; publicUrl?: string };
const silent: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silent;
  },
};
async function jsonBody(req: IncomingMessage) {
  if (req.headers["content-type"] !== "application/json") throw Error("JSON required");
  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 2048) throw Error("Request too large");
  }
  return JSON.parse(raw);
}

export async function startWebBridge(shared: SharedRuntime, options: WebBridgeOptions) {
  const secret = options.secret || randomBytes(32).toString("base64url");
  if (secret.length < 32) throw Error("COMPANION_BRIDGE_SECRET must contain at least 32 characters");
  const origins = new Set(options.origins.map((v) => new URL(v).origin));
  const tickets = new WebTickets();
  const active = new Set<string>();
  const clients = new Set<WebSocket>();
  const attempts = new Map<string, number[]>();
  const proposals = new Map<string, number>();
  let publicUrl = options.publicUrl || `ws://127.0.0.1:${options.port}/voice`;
  const endpoint = new URL(publicUrl);
  if (
    !["wss:", "ws:"].includes(endpoint.protocol) ||
    endpoint.search ||
    endpoint.username ||
    endpoint.password ||
    (endpoint.protocol === "ws:" && !["127.0.0.1", "localhost"].includes(endpoint.hostname))
  )
    throw Error("Public bridge URL must be wss:// (ws:// is loopback-only)");
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Content-Type", "application/json");
    if (req.url !== "/sessions" || req.method !== "POST") {
      res.writeHead(404).end("{}");
      return;
    }
    // Only the authenticated webapp/explicit local preview can mint capabilities.
    // This endpoint is not a browser CORS API and rejects browser Origins.
    if (req.headers.origin || !matchesSecret(req.headers.authorization, `Bearer ${secret}`)) {
      res.writeHead(403).end('{"error":"Forbidden"}');
      req.resume();
      return;
    }
    try {
      const body = await jsonBody(req);
      if (
        typeof body.identity !== "string" ||
        body.identity.length < 1 ||
        body.identity.length > 200 ||
        typeof body.origin !== "string" ||
        !origins.has(body.origin) ||
        ![body.writes, body.staff, body.marketplace].every((v) => typeof v === "boolean")
      )
        throw Error("Invalid grant");
      const now = Date.now();
      for (const [id, time] of proposals)
        if (time <= now - shared.config.COMPANION_PROPOSAL_COOLDOWN_S * 1000) proposals.delete(id);
      for (const [id, times] of attempts) {
        const recent = times.filter((t) => t > now - 3_600_000);
        if (!recent.length) attempts.delete(id);
        else attempts.set(id, recent);
      }
      const times = attempts.get(body.identity) ?? [];
      if (
        times.length >= 20 ||
        times.filter((t) => t > now - 60_000).length >= 3 ||
        (!attempts.has(body.identity) && attempts.size >= 1000)
      ) {
        res.writeHead(429).end('{"error":"Please wait before starting another conversation."}');
        return;
      }
      if (active.has(body.identity) || active.size >= 4) {
        res.writeHead(409).end('{"error":"A voice session is already active, or the bridge is full. End it first."}');
        return;
      }
      attempts.set(body.identity, [...times, now]);
      const grant: WebGrant = {
        identity: body.identity,
        origin: body.origin,
        writes: body.writes,
        staff: body.staff,
        marketplace: body.marketplace,
      };
      res.end(
        JSON.stringify({
          token: tickets.issue(grant),
          url: publicUrl,
          expiresAt: now + WEB_SESSION_MS,
          model: shared.provider.spec,
          protocol: 1,
        })
      );
    } catch {
      res.writeHead(400).end('{"error":"Invalid session request"}');
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/voice" || !origins.has(req.headers.origin ?? "") || clients.size >= 8) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    clients.add(ws);
    let grant: WebGrant | null = null,
      device: BrowserDevice | undefined,
      session: DeviceSession | undefined;
    let closed = false,
      initialized = false,
      ownsSession = false,
      alive = true,
      controls = 0,
      pcmBytes = 0,
      starts = 0;
    const send = (message: object | Buffer) => {
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 128 * 1024) {
        ws.close(1008, "Playback transport too slow");
        return;
      }
      ws.send(Buffer.isBuffer(message) ? message : JSON.stringify(message));
    };
    const authTimer = setTimeout(() => ws.close(1008, "Authentication timed out"), 5000);
    const lifetime = setTimeout(() => ws.close(1000, "Five-minute session ended"), WEB_SESSION_MS);
    const rate = setInterval(() => {
      controls = 0;
      pcmBytes = 0;
    }, 1000);
    const turnRate = setInterval(() => {
      starts = 0;
    }, 60_000);
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 20_000);
    ws.on("pong", () => {
      alive = true;
    });
    ws.on("error", () => ws.terminate());
    ws.on("close", () => {
      closed = true;
      clients.delete(ws);
      if (grant && ownsSession) active.delete(grant.identity);
      clearTimeout(authTimer);
      clearTimeout(lifetime);
      clearInterval(rate);
      clearInterval(turnRate);
      clearInterval(heartbeat);
      void session?.stop();
    });
    ws.on("message", (raw, binary) => {
      void (async () => {
        const bytes = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
        if (binary) {
          pcmBytes += bytes.length;
          if (!initialized || pcmBytes > 64_000) throw Error("Invalid audio rate");
          device?.microphone(bytes);
          return;
        }
        if (++controls > 100 || bytes.length > 2048) throw Error("Too many controls");
        const m = JSON.parse(bytes.toString());
        if (!m || typeof m !== "object") throw Error("Invalid command");
        if (!grant) {
          if (m.type !== "auth" || m.protocol !== 1) throw Error("Authentication required");
          grant = tickets.consume(m.token, req.headers.origin!);
          if (!grant || active.has(grant.identity) || active.size >= 4) throw Error("Invalid or expired voice ticket");
          clearTimeout(authTimer);
          active.add(grant.identity);
          ownsSession = true;
          const authority = grant;
          const id = `web-${createHash("sha256").update(grant.identity).digest("hex").slice(0, 16)}`;
          session = new DeviceSession(
            { id, host: "virtual", port: 1, psk: null },
            { ...shared, logger: silent },
            {
              connectDevice: async (_spec, handlers) =>
                (device = new BrowserDevice(handlers, authority, send, () => ws.close())),
              isStaff: () => authority.staff,
              isMarketplaceOpen: () => authority.marketplace,
              proposalHistory: proposals,
              authorizeTool: (name) => toolDenial(authority, name),
              onTranscript: (who, text) => device?.emit({ type: "transcript", who, text: text.slice(0, 2000) }),
              onTool: (event) => device?.emit({ type: "tool", ...event }),
            }
          );
          await session.start();
          if (closed) {
            await session.stop();
            return;
          }
          initialized = true;
          send({
            type: "ready",
            protocol: 1,
            model: shared.provider.spec,
            voice: shared.config.COMPANION_VOICE,
            promptHash: createHash("sha256").update(shared.instructions).digest("hex").slice(0, 16),
            tools: [...shared.definitions.keys(), "propose_talk", "show_on_screen", "event_now", "set_volume"],
            permissions: { writes: authority.writes, staff: authority.staff, marketplace: authority.marketplace },
            siteConfigured: !!shared.config.OWY_API_KEY,
            sampleRate: 16000,
          });
          return;
        }
        if (!initialized || !device) throw Error("Bridge is not ready");
        switch (m.type) {
          case "start":
            if (++starts > 30) throw Error("Too many turns");
            await device.request();
            break;
          case "stop":
            await device.cancel();
            break;
          case "commit":
            if (!Number.isSafeInteger(m.run)) throw Error("Invalid run");
            device.commit(m.run);
            break;
          case "playbackReady":
            if (!Number.isSafeInteger(m.run)) throw Error("Invalid run");
            device.playbackReady(m.run);
            break;
          case "volume":
            if (!Number.isFinite(m.value)) throw Error("Invalid volume");
            device.clientVolume(m.value);
            break;
          default:
            throw Error("Unsupported command");
        }
      })().catch(() => ws.close(1008, "Invalid request or bridge unavailable"));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  if (!options.publicUrl) publicUrl = `ws://127.0.0.1:${port}/voice`;
  return {
    url: `http://127.0.0.1:${port}`,
    secret,
    close: async () => {
      for (const ws of clients) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
