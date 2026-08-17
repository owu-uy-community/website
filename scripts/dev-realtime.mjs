/**
 * Local realtime sidecar. `next dev` cannot upgrade WebSockets (the Vercel
 * runtime API is production-only), so during development the browser connects
 * here instead — same wire protocol as /api/realtime — and server code
 * forwards its publishes via POST /publish.
 *
 * Run with: pnpm dev:realtime
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.REALTIME_PORT ?? 3199);

/** channel -> Set<ws> */
const channels = new Map();
/** ws -> Set<channel> */
const memberships = new Map();

function fanout(ch, ev, pl, sid) {
  const set = channels.get(ch);
  if (!set) return;
  const frame = JSON.stringify({ t: "msg", ch, ev, pl, sid });
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(frame);
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/publish") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { ch, ev, pl, sid } = JSON.parse(body);
        fanout(ch, ev, pl, sid);
        res.writeHead(200).end("ok");
      } catch {
        res.writeHead(400).end("bad request");
      }
    });

    return;
  }
  res.writeHead(200, { "content-type": "text/plain" }).end("owu dev realtime sidecar\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  memberships.set(ws, new Set());

  ws.on("message", (data) => {
    let frame;
    try {
      frame = JSON.parse(String(data));
    } catch {
      return;
    }

    switch (frame.t) {
      case "sub": {
        let set = channels.get(frame.ch);
        if (!set) channels.set(frame.ch, (set = new Set()));
        set.add(ws);
        memberships.get(ws)?.add(frame.ch);
        ws.send(JSON.stringify({ t: "ok", ch: frame.ch }));
        break;
      }
      case "unsub": {
        channels.get(frame.ch)?.delete(ws);
        memberships.get(ws)?.delete(frame.ch);
        break;
      }
      case "pub": {
        fanout(frame.ch, frame.ev, frame.pl, frame.sid);
        break;
      }
      case "ping": {
        ws.send(JSON.stringify({ t: "pong" }));
        break;
      }
    }
  });

  ws.on("close", () => {
    for (const ch of memberships.get(ws) ?? []) {
      const set = channels.get(ch);
      set?.delete(ws);
      if (set && set.size === 0) channels.delete(ch);
    }
    memberships.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`⚡ dev realtime sidecar on ws://localhost:${PORT} (POST /publish for server events)`);
});
