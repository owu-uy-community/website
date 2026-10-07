/**
 * Loopback control surface for the bridge operator at the venue, bound to
 * 127.0.0.1 and unauthenticated on purpose (no secrets, only audio routing):
 *
 *   GET  /            one-page UI (per device: mic / audio output, browser attached?)
 *   *    /rpc/…       the typed oRPC router (`web/rpc.ts`) — what the Next.js
 *                     admin talks to through `companion.getAudioRouting/setAudioRouting`
 *   GET|POST /api/settings   plain-JSON mirror of the same procedures for the page
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { call } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import type { BridgeConfig } from "../config";
import type { Logger } from "../log";
import { bridgeRouter, type BridgeRpcContext, type RoutableSession } from "./rpc";

export { settingsSnapshot, type SettingsSnapshot } from "./rpc";

const PAGE = `<!doctype html><meta charset="utf-8"><title>Owy bridge</title>
<style>body{font:15px/1.4 -apple-system,system-ui,sans-serif;background:#000;color:#FBF5E7;margin:0;padding:24px;max-width:720px}
h1{font-size:20px;color:#F5BB03;margin:0 0 4px}small{color:#8A8A8A}.card{background:#141414;border-radius:16px;padding:16px 18px;margin:16px 0}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0}.seg{display:flex;border-radius:12px;overflow:hidden;background:#1F1F1F}
.seg button{border:0;padding:8px 14px;background:transparent;color:#FBF5E7;cursor:pointer;font:inherit}.seg button.on{background:#0162C8}
.off{color:#8A8A8A}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#8A8A8A;margin-right:8px}.dot.on{background:#3FB950}</style>
<h1>Owy bridge · audio</h1><small>Elegí por dispositivo dónde vive el micrófono y la salida. <b>laptop</b> = esta máquina (mic de escenario + parlantes del evento); el dispositivo sigue siendo el disparador, la cara y los subtítulos.</small>
<div class="card"><b>laptop</b> = un navegador con el Companion lab abierto pone su micrófono y sus parlantes al servicio del dispositivo: <i>http://127.0.0.1:3311</i> (<code>COMPANION_WEB_VOICE=1 pnpm companion:emulator:preview</code>, bridge con <code>COMPANION_WEB_BRIDGE=1</code>) o <i>/admin/companion</i> en el sitio → <i>Hablá con Owy</i> → activá el permiso → <i>Audio de laptop para un dispositivo físico</i> → <i>Usar este navegador como audio de …</i>. Sin navegador enchufado, el bridge vuelve al audio del dispositivo.</div><div id="devices"></div>
<script>
const seg=(id,which,cur)=>['device','laptop'].map(v=>'<button class="'+(cur===v?'on':'')+'" onclick="set(\\''+id+'\\',\\''+which+'\\',\\''+v+'\\')">'+(v==='device'?'dispositivo':'laptop')+'</button>').join('');
async function load(){const s=await (await fetch('/api/settings')).json();
document.getElementById('devices').innerHTML=s.devices.map(d=>'<div class="card"><div class="row"><b><span class="dot '+(d.connected?'on':'')+'"></span>'+d.id+'</b><small>'+(d.source==='device'?'guardado en el dispositivo':d.source==='override'?'elegido acá':'por defecto (env)')+'</small></div><div class="row"><span>Navegador enchufado</span><span class="'+(d.peer?'':'off')+'">'+(d.peer?'sí':'no')+'</span></div><div class="row"><span>Micrófono</span><div class="seg">'+seg(d.id,'mic',d.mic)+'</div></div><div class="row"><span>Salida de audio</span><div class="seg">'+seg(d.id,'output',d.output)+'</div></div></div>').join('')||'<div class="card off">Sin dispositivos (COMPANION_DEVICES vacío).</div>';}
async function set(id,which,route){await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:id,[which]:route})});setTimeout(load,400);}
load();setInterval(load,5000);
</script>`;

export function startSettingsServer(
  sessions: readonly RoutableSession[],
  config: BridgeConfig,
  logger: Logger
): Promise<{ url: string; rpcUrl: string; close: () => Promise<void> }> {
  const context: BridgeRpcContext = { sessions, log: (message) => logger.info(message) };
  const rpc = new RPCHandler(bridgeRouter);
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const { matched } = await rpc.handle(req, res, { prefix: "/rpc", context });
      if (matched) return;
      if (req.method === "GET" && req.url === "/api/settings") {
        json(res, 200, await call(bridgeRouter.settings.get, undefined, { context }));
        return;
      }
      if (req.method === "POST" && req.url === "/api/settings") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        json(res, 200, await call(bridgeRouter.settings.set, JSON.parse(Buffer.concat(chunks).toString() || "{}"), { context }));
        return;
      }
      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(PAGE);
        return;
      }
      res.writeHead(404).end();
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 400;
      json(res, status, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.COMPANION_SETTINGS_PORT, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${config.COMPANION_SETTINGS_PORT}/`;
      resolve({ url, rpcUrl: `${url}rpc`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
