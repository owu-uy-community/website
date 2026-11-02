/**
 * The bridge's own page, for when the site can't reach it (the venue's
 * internet is down): every setting from the registry, the same writes the
 * panel makes (reported to the site as `local` once it is back), a test tone
 * and a 4 s recording of the Mac's mic. The real place is the site's
 * /admin/companion → Control.
 *
 * Bound to 127.0.0.1 (`COMPANION_BIND_HOST`; in Docker, published on the
 * host's loopback only), behind Basic auth (any user, COMPANION_BRIDGE_SECRET
 * as the password; a random one printed at start when it is unset), and only
 * for a loopback Host (a page from elsewhere can't rebind its name to it):
 *
 *   GET  /              the page
 *   GET  /api/state     {status, rows}
 *   POST /api/set       {target, key, value}
 *   POST /api/command   a CompanionCommand (tone, probe-mic, hush, say…)
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { BridgeConfig } from "../config";
import type { ControlPlane } from "../control/plane";
import type { Logger } from "../log";
import { CompanionCommandSchema } from "./contract";
import { SETTING_GROUPS, SETTINGS } from "./registry";
import { matchesSecret } from "./tickets";

// The page's script avoids backticks and `${`: it lives inside this template literal.
const page = () => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owy bridge</title>
<style>body{font:15px/1.4 -apple-system,system-ui,sans-serif;background:#000;color:#FBF5E7;margin:0;padding:20px;max-width:760px}
h1{font-size:20px;color:#F5BB03;margin:0 0 4px}h2{font-size:16px;margin:0 0 6px}h3{font-size:13px;color:#8A8A8A;margin:14px 0 4px;text-transform:uppercase;letter-spacing:.08em}
small{color:#8A8A8A}.card{background:#141414;border-radius:16px;padding:14px 16px;margin:14px 0}.row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 0;min-height:36px}
button,select,input{font:inherit;color:#FBF5E7;background:#1F1F1F;border:0;border-radius:10px;padding:7px 12px}button.on{background:#0162C8}button{cursor:pointer}input{width:200px}
.seg{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#8A8A8A;margin-right:8px}.dot.on{background:#3FB950}.warn{color:#F5BB03}</style>
<h1>Owy bridge · página de respaldo</h1><div class="card">El lugar de siempre es el panel: <b>/admin/companion → Control</b>. Esta página es para cuando el sitio no llega a este bridge; lo que cambies acá se le avisa al sitio cuando vuelva.</div>
<div id="root"><small>Cargando…</small></div>
<script>
var SETTINGS=${JSON.stringify(SETTINGS)},GROUPS=${JSON.stringify(SETTING_GROUPS)},state=null,note='';
var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
async function post(url,body){var r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json();}
function control(target,key,value){var s=SETTINGS[key],a='data-t="'+esc(target)+'" data-k="'+esc(key)+'"';
 if(s.type==='boolean')return '<div class="seg"><button '+a+' data-v="true" class="'+(value===true?'on':'')+'">sí</button><button '+a+' data-v="false" class="'+(value===false?'on':'')+'">no</button></div>';
 if(s.type==='enum')return '<div class="seg">'+s.options.map(function(o){return '<button '+a+' data-v="'+esc(JSON.stringify(o[0]))+'" class="'+(value===o[0]?'on':'')+'">'+esc(o[1])+'</button>';}).join('')+'</div>';
 if(s.type==='number')return '<input type="number" '+a+' min="'+s.min+'" max="'+s.max+'" step="'+s.step+'" value="'+esc(value)+'">';
 return '<input '+a+' value="'+esc(value)+'" placeholder="'+(s.nullable?'(vacío)':'')+'">';}
function block(target,scope,values){var html='';Object.keys(GROUPS).forEach(function(g){var keys=Object.keys(SETTINGS).filter(function(k){return SETTINGS[k].scope===scope&&SETTINGS[k].group===g;});if(!keys.length)return;
 html+='<h3>'+esc(GROUPS[g])+'</h3>'+keys.map(function(k){return '<div class="row"><span>'+esc(SETTINGS[k].label)+'</span>'+control(target,k,values[k])+'</div>';}).join('');});return html;}
function render(){if(!state)return;var s=state.status;if(document.activeElement&&document.activeElement.tagName==='INPUT')return;
 var html='<div class="card"><h2>Bridge <small>'+esc(s.machine)+' · '+esc(s.version)+'</small></h2>'+(note?'<div class="warn"><small>'+esc(note)+'</small></div>':'')+
 '<div class="row"><span>Pruebas</span><div class="seg"><button data-cmd="mac-tone">Tono en la Mac</button><button data-cmd="probe">Grabar 4 s</button></div></div>'+block('bridge','bridge',s.values)+'</div>';
 html+=s.devices.map(function(d){return '<div class="card"><h2><span class="dot '+(d.connected?'on':'')+'"></span>'+esc(d.id)+' <small>'+esc(d.host)+(d.audio?' · '+esc(d.audio):'')+'</small></h2>'+
 '<div class="row"><span>Pruebas</span><div class="seg"><button data-cmd="tone" data-d="'+esc(d.id)+'">Tono de prueba</button><button data-cmd="hush" data-d="'+esc(d.id)+'">Callar</button></div></div>'+block(d.id,'device',d.values)+'</div>';}).join('')||'<div class="card"><small>Sin dispositivos (COMPANION_DEVICES vacío).</small></div>';
 document.getElementById('root').innerHTML=html;}
async function load(){state=await (await fetch('/api/state')).json();render();}
async function set(target,key,value){var r=await post('/api/set',{target:target,key:key,value:value});note=r.ok?'':(r.error||'no se pudo');await load();}
document.addEventListener('click',async function(e){var b=e.target.closest('button');if(!b)return;
 if(b.dataset.k)return set(b.dataset.t,b.dataset.k,JSON.parse(b.dataset.v));
 var cmd=b.dataset.cmd,r;if(!cmd)return;b.disabled=true;
 if(cmd==='mac-tone')r=await post('/api/command',{type:'tone',target:'mac'});
 else if(cmd==='tone')r=await post('/api/command',{type:'tone',target:b.dataset.d});
 else if(cmd==='hush')r=await post('/api/command',{type:'hush',deviceId:b.dataset.d});
 else if(cmd==='probe'){note='grabando 4 s…';render();r=await post('/api/command',{type:'probe-mic',ms:4000});}
 note=!r.ok?(r.error||'no se pudo'):cmd==='probe'?'pico '+Math.round(r.data.peak*100)+'% · promedio '+Math.round(r.data.rms*100)+'%'+(r.data.peak<0.02?' — casi nada: ¿es esta entrada?':''):'';b.disabled=false;render();});
document.addEventListener('change',function(e){var i=e.target;if(!i.dataset||!i.dataset.k)return;var s=SETTINGS[i.dataset.k];
 var v=s.type==='number'?Number(i.value):(i.value===''&&s.nullable?null:i.value);i.blur();set(i.dataset.t,i.dataset.k,v);});
load();setInterval(load,5000);
</script>`;

export interface LocalPageOptions {
  control: ControlPlane;
  config: BridgeConfig;
  logger: Logger;
}

export function startSettingsServer({ control, config, logger }: LocalPageOptions): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const password = config.COMPANION_BRIDGE_SECRET ?? randomBytes(9).toString("base64url");
  if (!config.COMPANION_BRIDGE_SECRET) logger.info(`página local: usuario «owy», clave ${password} (COMPANION_BRIDGE_SECRET la fija)`);
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const port = config.COMPANION_SETTINGS_PORT;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([...hosts].map((host) => `http://${host}`));
  const authorized = (req: IncomingMessage) => {
    const match = /^Basic (.+)$/.exec(req.headers.authorization ?? "");
    if (!match) return false;
    const decoded = Buffer.from(match[1], "base64").toString();
    const colon = decoded.indexOf(":");
    return colon > 0 && matchesSecret(decoded.slice(colon + 1), password);
  };
  const body = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 16_384) throw new Error("body too large");
      chunks.push(chunk as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString() || "{}") as unknown;
  };
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // Only this machine's names: a page elsewhere can't point its own name at 127.0.0.1 and read this.
      if (!hosts.has(req.headers.host ?? "")) return json(res, 421, { error: "host not allowed" });
      if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin && !origins.has(req.headers.origin))
        return json(res, 403, { error: "cross-origin writes are not allowed" });
      if (!authorized(req)) {
        res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Owy bridge", charset="UTF-8"' }).end();
        return;
      }
      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(page());
        return;
      }
      if (req.method === "GET" && req.url === "/api/state") return json(res, 200, { status: control.status(), rows: control.rows() });
      if (req.method === "POST" && req.url === "/api/set") {
        const input = (await body(req)) as { target?: unknown; key?: unknown; value?: unknown };
        if (typeof input.target !== "string" || typeof input.key !== "string") return json(res, 400, { ok: false, error: "target y key" });
        return json(res, 200, control.change(input.target, input.key, input.value, "local"));
      }
      if (req.method === "POST" && req.url === "/api/command") {
        const command = CompanionCommandSchema.safeParse(await body(req));
        if (!command.success) return json(res, 400, { ok: false, error: "comando inválido" });
        return json(res, 200, await control.runLocal(command.data));
      }
      res.writeHead(404).end();
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, config.COMPANION_BIND_HOST, () => {
      const url = `http://127.0.0.1:${port}/`;
      resolve({ url, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
