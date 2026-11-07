import { createServer, type IncomingMessage } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { owuApi } from "../../../../agent/lib/owu-api";
import { DeviceSession, type SharedRuntime } from "../index";
import type { Logger } from "../log";
import { createStageMirror, type StageMirror } from "../stage";
import { BrowserDevice } from "./device";
import { TalkMessageSchema, type DeviceRouting, type TalkReply } from "./contract";
import { matchesSecret, toolDenial, WebTickets, WEB_SESSION_MS, type WebGrant } from "./tickets";

/** What the talk console shows for its device: routes, modo pitch, the voice. */
const routingOf = (session: DeviceSession): DeviceRouting => ({
  id: session.id,
  connected: session.connected,
  ...session.audioRouting(),
  peer: session.hasPeer,
  pitch: session.pitchSettings(),
  voice: session.voiceStatus(),
});

export type WebBridgeOptions = { port: number; host?: string; origins: string[]; secret?: string; publicUrl?: string };
/** A browser attached as a device's laptop audio stays for the whole open space, not half an hour. */
export const ATTACHED_SESSION_MS = 6 * 60 * 60_000;
/** Talk-console commands per minute (a `status` poll every 3 s is 20); past it they get a notice, not a close. */
export const TALK_BUDGET_PER_MINUTE = 120;
const TALK_TYPES = new Set(["say", "ask", "hush", "talk", "route", "pitch", "status"]);
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
  const tickets = new WebTickets(secret);
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
      session: DeviceSession | undefined,
      mirror: StageMirror | undefined;
    let closed = false,
      initialized = false,
      ownsSession = false,
      alive = true,
      controls = 0,
      pcmBytes = 0,
      starts = 0,
      talks = 0;
    const send = (message: object | Buffer) => {
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 128 * 1024) {
        ws.close(1008, "Playback transport too slow");
        return;
      }
      ws.send(Buffer.isBuffer(message) ? message : JSON.stringify(message));
    };
    const authTimer = setTimeout(() => ws.close(1008, "Authentication timed out"), 5000);
    let lifetime = setTimeout(() => ws.close(1000, "Session ended"), WEB_SESSION_MS);
    const rate = setInterval(() => {
      controls = 0;
      pcmBytes = 0;
    }, 1000);
    const turnRate = setInterval(() => {
      starts = 0;
      talks = 0;
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
    let attached: DeviceSession | null = null;
    const reply = (message: TalkReply) => send(message);
    const status = (target: DeviceSession) => reply({ type: "status", device: routingOf(target), talk: target.talkContext });
    /**
     * The talk console («Owy, en vivo»): commands for the device this browser is attached to.
     * A bad or failed command is answered with a notice; it never closes the socket.
     */
    const talk = async (raw: unknown) => {
      const target = attached;
      if (!target) return reply({ type: "notice", level: "error", message: "Conectá este navegador a un dispositivo primero." });
      if (++talks > TALK_BUDGET_PER_MINUTE)
        return reply({ type: "notice", level: "warn", message: "Demasiados comandos por minuto; esperá un momento." });
      const parsed = TalkMessageSchema.safeParse(raw);
      if (!parsed.success) return reply({ type: "notice", level: "error", message: "Comando de charla inválido." });
      const m = parsed.data;
      try {
        switch (m.type) {
          case "say":
            return await target.say(m.text, m.clip);
          case "ask":
            return await target.ask(m.text, m.asker);
          case "hush":
            return target.hush();
          case "talk":
            target.setTalk(m.talk);
            return status(target);
          case "route":
            if (m.mic) target.setAudioRouting("mic", m.mic);
            if (m.output) target.setAudioRouting("output", m.output);
            // A device select confirms over its native API: answer once it has had a moment.
            return void setTimeout(() => status(target), 400);
          case "pitch":
            target.setPitchMode(m.mode);
            return void setTimeout(() => status(target), 400);
          case "status":
            return status(target);
        }
      } catch (error) {
        reply({ type: "notice", level: "error", message: error instanceof Error ? error.message : String(error) });
      }
    };
    const detach = () => {
      if (!attached || !device) return;
      attached.detachPeer(device);
      device.detach();
      attached = null;
    };
    ws.on("close", () => {
      closed = true;
      clients.delete(ws);
      detach();
      if (grant && ownsSession) active.delete(grant.identity);
      clearTimeout(authTimer);
      clearTimeout(lifetime);
      clearInterval(rate);
      clearInterval(turnRate);
      clearInterval(heartbeat);
      mirror?.stop();
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
        // An attached console may send a talk line (up to 600 characters, accents included).
        if (bytes.length > (attached ? 4096 : 2048)) throw Error("Too many controls");
        const m = JSON.parse(bytes.toString());
        if (!m || typeof m !== "object") throw Error("Invalid command");
        if (initialized && TALK_TYPES.has(m.type)) return void talk(m);
        if (++controls > 100) throw Error("Too many controls");
        if (!grant) {
          if (m.type !== "auth" || m.protocol !== 1) throw Error("Authentication required");
          grant = tickets.consume(m.token, req.headers.origin!);
          if (!grant || active.has(grant.identity) || active.size >= 4) throw Error("Invalid or expired voice ticket");
          clearTimeout(authTimer);
          active.add(grant.identity);
          ownsSession = true;
          const authority = grant;
          const id = `web-${createHash("sha256").update(grant.identity).digest("hex").slice(0, 16)}`;
          // The browser voice mirrors onto the video wall exactly like a gadget does.
          const stage = createStageMirror({
            api: shared.config.OWY_API_KEY ? owuApi() : null,
            logger: shared.logger.child(id),
            source: id,
            publish: shared.publishStage,
          });
          mirror = stage;
          session = new DeviceSession(
            { id, host: "virtual", port: 1, psk: null },
            // Browser sessions are quiet by default (visitors' words stay out of the
            // venue log); COMPANION_WEB_DEBUG=1 traces them like a physical Owy.
            // A browser is its own mic: the Mac's stays with the physical devices.
            { ...shared, hostMic: undefined, logger: process.env.COMPANION_WEB_DEBUG === "1" ? shared.logger.child("web") : silent },
            {
              connectDevice: async (_spec, handlers) =>
                (device = stage.wrap(new BrowserDevice(handlers, authority, send, () => ws.close()))),
              onFace: stage.face,
              onExpression: stage.expression,
              onMouth: stage.mouth,
              onLevel: stage.level,
              lazyRealtime: true,
              isStaff: () => authority.staff,
              isMarketplaceOpen: () => authority.marketplace,
              proposalHistory: proposals,
              authorizeTool: (name) => toolDenial(authority, name),
              onTranscript: (who, text) => {
                device?.emit({ type: "transcript", who, text: text.slice(0, 2000) });
                stage.transcript(who, text);
              },
              onTool: (event) => {
                device?.emit({ type: "tool", ...event });
                stage.tool(event.status === "running" ? event.name : null);
              },
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
            tools: [...new Set([...shared.definitions.keys(), "propose_talk", "show_on_screen", "set_volume"])],
            permissions: { writes: authority.writes, staff: authority.staff, marketplace: authority.marketplace },
            siteConfigured: !!shared.config.OWY_API_KEY,
            sampleRate: 16000,
          });
          return;
        }
        if (!initialized || !device) throw Error("Bridge is not ready");
        switch (m.type) {
          case "attach": {
            // This browser becomes a physical device's laptop audio (mic + speakers)
            // for as long as the tab lives: the knob keeps trigger, face, captions.
            if (typeof m.deviceId !== "string") throw Error("Invalid device");
            const target = shared.sessions?.get(m.deviceId);
            if (!target) throw Error("Unknown device");
            if (target.hasPeer && attached !== target) throw Error("Device already has a browser attached");
            detach();
            target.attachPeer(device);
            attached = target;
            clearTimeout(lifetime);
            lifetime = setTimeout(() => ws.close(1000, "Attached session ended"), ATTACHED_SESSION_MS);
            break;
          }
          case "detach":
            if (attached)
              shared.logger.info(
                `${attached.id}: browser leaving (${typeof m.reason === "string" ? m.reason.slice(0, 200) : "-"})`
              );
            detach();
            clearTimeout(lifetime);
            lifetime = setTimeout(() => ws.close(1000, "Session ended"), WEB_SESSION_MS);
            break;
          case "start":
            if (attached) throw Error("Attached as laptop audio; the device starts the turns");
            if (++starts > 30) throw Error("Too many turns");
            await device.request(m.mode === "pitch" ? { mode: "pitch" } : {});
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
      })().catch((error) => {
        shared.logger.warn(`web client closed: ${error instanceof Error ? error.message : error}`);
        ws.close(1008, "Invalid request or bridge unavailable");
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "127.0.0.1", () => {
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
