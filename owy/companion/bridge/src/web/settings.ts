/**
 * Loopback control surface for the bridge operator at the venue, bound to
 * 127.0.0.1 (`COMPANION_BIND_HOST`; in Docker, published on the host's loopback
 * only) and unauthenticated on purpose (no secrets, only audio routing):
 *
 *   GET  /            fallback one-page UI (per device: mic / audio output / modo pitch; the Mac's mic) for when
 *                     the site cannot reach this bridge; the real place is the site's /admin/companion
 *   *    /rpc/…       the typed oRPC router (`web/rpc.ts`) — what the Next.js
 *                     admin talks to through `companion.getAudioRouting/setAudioRouting`
 *   GET|POST /api/settings[/pitch|/host-mic|/host-mic/probe]   plain-JSON mirror of the same procedures for the page
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { call } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import type { BridgeConfig } from "../config";
import type { Logger } from "../log";
import { bridgeRouter, type BridgeRpcContext, type RoutableHostMic, type RoutableSession } from "./rpc";

export { settingsSnapshot, type SettingsSnapshot } from "./rpc";

// The page's script avoids backticks and `${`: it lives inside this template literal.
const PAGE = `<!doctype html><meta charset="utf-8"><title>Owy bridge</title>
<style>body{font:15px/1.4 -apple-system,system-ui,sans-serif;background:#000;color:#FBF5E7;margin:0;padding:24px;max-width:720px}
h1{font-size:20px;color:#F5BB03;margin:0 0 4px}h2{font-size:16px;margin:0 0 8px}small{color:#8A8A8A}.card{background:#141414;border-radius:16px;padding:16px 18px;margin:16px 0}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0}.seg{display:flex;border-radius:12px;overflow:hidden;background:#1F1F1F}
.seg button,.btn{border:0;padding:8px 14px;background:transparent;color:#FBF5E7;cursor:pointer;font:inherit}.seg button.on{background:#0162C8}.btn{background:#1F1F1F;border-radius:12px}
select{font:inherit;background:#1F1F1F;color:#FBF5E7;border:0;border-radius:12px;padding:8px 10px;max-width:320px}
.off{color:#8A8A8A}.warn{color:#F5BB03}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#8A8A8A;margin-right:8px}.dot.on{background:#3FB950}.dot.bad{background:#F85149}</style>
<h1>Owy bridge · ajustes de respaldo</h1><div class="card"><b>El lugar de siempre es el sitio:</b> <i>/admin/companion</i> (emulador, Hablá con Owy y la tarjeta «Owy físico» con estos mismos ajustes), con el sitio corriendo en esta Mac. Esta página queda para cuando el sitio no llega a este bridge (por ejemplo, el sitio en Vercel en el evento).</div><small>Por dispositivo: de dónde sale el micrófono y adónde va la voz. <b>Owy</b> = el propio dispositivo · <b>Mac</b> = un micrófono de esta máquina (el integrado, un receptor DJI: «Wireless Microphone RX») · <b>navegador</b> = una pestaña enchufada como audio de ese Owy (Hablá con Owy en /admin/companion, o la consola de la charla). El dispositivo sigue siendo el disparador, la cara y los subtítulos.</small>
<div id="mac"></div><div id="devices"></div>
<script>
var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
var seg=function(attrs,options,cur){return options.map(function(o){return '<button class="'+(cur===o[0]?'on':'')+'" '+attrs+' data-v="'+esc(o[0])+'">'+o[1]+'</button>';}).join('');};
var HEALTH={open:['on','abierto'],starting:['','abriendo…'],off:['','apagado (se abre cuando un dispositivo lo elige)'],'no-signal':['bad','sin señal'],gone:['bad','no está'],unavailable:['','no disponible']};
var probe='';
async function post(url,body){var r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json();}
function renderMac(m){if(!m){document.getElementById('mac').innerHTML='';return;}if(document.activeElement&&document.activeElement.id==='hostmic')return;
var h=HEALTH[m.health]||['',m.health];var names=m.available.slice();if(m.name&&names.indexOf(m.name)<0)names.unshift(m.name);
document.getElementById('mac').innerHTML='<div class="card"><h2><span class="dot '+h[0]+'"></span>Micrófono de la Mac <small>'+esc(h[1])+'</small></h2>'+(m.detail?'<div class="warn"><small>'+esc(m.detail)+'</small></div>':'')+
(m.health==='unavailable'?'':'<div class="row"><span>Entrada</span><select id="hostmic"><option value="">integrado</option>'+names.map(function(n){return '<option'+(n===m.name?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</select></div>'+
'<div class="row"><span>Canal <small>(DJI en estéreo: un transmisor por lado)</small></span><div class="seg">'+seg('data-act="channel"',[['L','L'],['R','R'],['mix','mezcla']],m.channel)+'</div></div>'+
'<div class="row"><span>Probar <small>'+esc(probe)+'</small></span><button class="btn" data-act="probe">Grabar 4 s</button></div>')+'</div>';}
function renderDevices(s){document.getElementById('devices').innerHTML=s.devices.map(function(d){var id='data-id="'+esc(d.id)+'"';return '<div class="card"><div class="row"><b><span class="dot '+(d.connected?'on':'')+'"></span>'+esc(d.id)+'</b><small>'+(d.source==='device'?'guardado en el dispositivo':d.source==='override'?'elegido acá':'por defecto (env)')+'</small></div>'+
'<div class="row"><span>Navegador enchufado</span><span class="'+(d.peer?'':'off')+'">'+(d.peer?'sí':'no')+'</span></div>'+
'<div class="row"><span>Micrófono</span><div class="seg">'+seg('data-act="route" data-which="mic" '+id,[['device','Owy'],['host','Mac'],['laptop','navegador']],d.mic)+'</div></div>'+
'<div class="row"><span>Salida de audio</span><div class="seg">'+seg('data-act="route" data-which="output" '+id,[['device','Owy'],['laptop','navegador']],d.output)+'</div></div>'+
'<div class="row"><span>Modo pitch <small>(tocar, contar la charla, tocar)</small></span><div class="seg">'+seg('data-act="mode" '+id,[['false','no'],['true','sí']],String(d.pitch.mode))+'</div></div>'+
'<div class="row"><span>Respuesta al pitch</span><div class="seg">'+seg('data-act="voice" '+id,[['silent','callado'],['confirm','confirma'],['react','confirma y comenta']],d.pitch.voice)+'</div></div></div>';}).join('')||'<div class="card off">Sin dispositivos (COMPANION_DEVICES vacío).</div>';}
function render(s){renderMac(s.hostMic);renderDevices(s);}
async function load(){render(await (await fetch('/api/settings')).json());}
document.addEventListener('click',async function(e){var b=e.target.closest('button[data-act]');if(!b)return;var act=b.dataset.act,v=b.dataset.v,s;
if(act==='route'){var body={deviceId:b.dataset.id};body[b.dataset.which]=v;s=await post('/api/settings',body);}
else if(act==='mode')s=await post('/api/settings/pitch',{deviceId:b.dataset.id,mode:v==='true'});
else if(act==='voice')s=await post('/api/settings/pitch',{deviceId:b.dataset.id,voice:v});
else if(act==='channel')s=await post('/api/settings/host-mic',{channel:v});
else if(act==='probe'){probe='grabando…';b.disabled=true;var p=await post('/api/settings/host-mic/probe',{ms:4000});probe=p.error?p.error:'pico '+Math.round(p.peak*100)+'% · promedio '+Math.round(p.rms*100)+'% · '+p.seconds.toFixed(1)+' s'+(p.peak<0.02?' — casi nada: ¿es esta entrada?':'');}
if(s&&s.devices)render(s);else setTimeout(load,300);});
document.addEventListener('change',async function(e){if(e.target.id!=='hostmic')return;var name=e.target.value||null;e.target.blur();render(await post('/api/settings/host-mic',{name:name}));});
load();setInterval(load,5000);
</script>`;

const POSTS = {
  "/api/settings": bridgeRouter.settings.set,
  "/api/settings/pitch": bridgeRouter.settings.setPitch,
  "/api/settings/host-mic": bridgeRouter.settings.setHostMic,
  "/api/settings/host-mic/probe": bridgeRouter.settings.probeHostMic,
} as const;

export function startSettingsServer(
  sessions: readonly RoutableSession[],
  config: BridgeConfig,
  logger: Logger,
  hostMic?: RoutableHostMic
): Promise<{ url: string; rpcUrl: string; close: () => Promise<void> }> {
  const context: BridgeRpcContext = { sessions, hostMic, log: (message) => logger.info(message) };
  const rpc = new RPCHandler(bridgeRouter);
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  // Loopback and unauthenticated by design, so the one thing to refuse is a
  // cross-site form POST from a page the operator happens to have open.
  const own = new Set(["127.0.0.1", "localhost"].map((host) => `http://${host}:${config.COMPANION_SETTINGS_PORT}`));
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin && !own.has(req.headers.origin)) {
        json(res, 403, { error: "cross-origin writes are not allowed" });
        return;
      }
      const { matched } = await rpc.handle(req, res, { prefix: "/rpc", context });
      if (matched) return;
      if (req.method === "GET" && req.url === "/api/settings") {
        json(res, 200, await call(bridgeRouter.settings.get, undefined, { context }));
        return;
      }
      const procedure = req.method === "POST" ? POSTS[req.url as keyof typeof POSTS] : undefined;
      if (procedure) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        json(res, 200, await call(procedure as typeof bridgeRouter.settings.set, body, { context }));
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
    server.listen(config.COMPANION_SETTINGS_PORT, config.COMPANION_BIND_HOST, () => {
      const url = `http://127.0.0.1:${config.COMPANION_SETTINGS_PORT}/`;
      resolve({ url, rpcUrl: `${url}rpc`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
