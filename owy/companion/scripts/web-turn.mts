// One voice turn through the bridge's browser transport, without a browser or a
// device: auth → start → stream a 16 kHz mono WAV as the mic (+ silence for the
// server VAD) → count the reply PCM → RUN_END. Exercises the realtime provider
// exactly like the workbench's "Talk to Owy" does.
//
//   say -v "Flo (Spanish (Spain))" -o /tmp/q.wav --data-format=LEI16@16000 "Hola Owy, ¿qué es OWU?"
//   WEB_TURN_OUT=/tmp/reply.wav node_modules/.bin/tsx companion/scripts/web-turn.mts /tmp/q.wav   # from owy/, bridge running with COMPANION_WEB_BRIDGE=1
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { writeFileSync } from "node:fs";
import { fromWav, toWav } from "../bridge/src/audio/pcm";

const { url, secret } = JSON.parse(readFileSync(new URL("../.eve/web-bridge.json", import.meta.url), "utf8"));
const origin = "http://127.0.0.1:3311";
const http = url.replace(/^ws/, "http").replace(/\/voice$/, "");
const ticket = await (await fetch(`${http}/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
  body: JSON.stringify({ identity: "web-turn", origin, writes: false, staff: false, marketplace: false }),
})).json();
const wav = fromWav(readFileSync(process.argv[2] ?? "/tmp/q1.wav"));
if (wav.sampleRate !== 16000 || wav.channels !== 1) throw Error(`wav is ${wav.sampleRate} Hz / ${wav.channels} ch`);
console.log(`question: ${wav.pcm.length} B of 16 kHz PCM (${(wav.pcm.length / 32000).toFixed(1)} s)`);

const ws = new WebSocket(ticket.url, { origin });
ws.binaryType = "nodebuffer";
let run = 0, replyBytes = 0, streaming = false;
const reply: Buffer[] = [];
const t0 = Date.now();
const log = (m: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
const send = (m: object) => ws.send(JSON.stringify(m));
ws.on("open", () => send({ type: "auth", token: ticket.token, protocol: 1 }));
ws.on("message", (raw, binary) => {
  if (binary) { replyBytes += (raw as Buffer).length - 4; reply.push((raw as Buffer).subarray(4)); return; }
  const m = JSON.parse(raw.toString());
  if (m.type === "ready") { log("ready → start"); send({ type: "start" }); }
  else if (m.type === "accepted") {
    run = m.run; log(`accepted run ${run} → streaming the question as the mic`);
    streaming = true;
    let offset = 0;
    const frame = 640;
    const started = Date.now();
    const tick = () => {
      if (!streaming || ws.readyState !== WebSocket.OPEN) return;
      const due = Math.floor((Date.now() - started) / 20);
      while (offset / frame < due) {
        const packet = Buffer.alloc(frame + 4);
        packet.writeUInt32LE(run, 0);
        if (offset + frame <= wav.pcm.length) wav.pcm.copy(packet, 4, offset, offset + frame); // then silence for the VAD
        ws.send(packet);
        offset += frame;
      }
      setTimeout(tick, 20);
    };
    tick();
  } else if (m.type === "event") {
    log(`event ${m.event}${m.data ? " " + JSON.stringify(m.data).slice(0, 160) : ""}`);
    if (m.event === "STT_END" || m.event === "STT_VAD_END") streaming = false;
    if (m.event === "STT_END") send({ type: "playbackReady", run }); // what web-voice.ts does: the speaker is ready once the mic closed
    if (m.event === "RUN_END") {
      log(`reply audio received: ${replyBytes} B (${(replyBytes / 32000).toFixed(1)} s @16k)`);
      if (process.env.WEB_TURN_OUT) { writeFileSync(process.env.WEB_TURN_OUT, toWav(Buffer.concat(reply), 16000)); log(`reply saved to ${process.env.WEB_TURN_OUT}`); }
      replyBytes = 0; reply.length = 0;
    }
  } else if (m.type === "transcript") log(`transcript ${m.who}: ${m.text}`);
  else if (m.type === "screen") log(`screen ${JSON.stringify(m.command).slice(0, 160)}`);
  else log(`msg ${m.type}`);
});
ws.on("close", (code, reason) => { log(`closed ${code} ${reason}`); process.exit(0); });
setTimeout(() => { log("done"); ws.close(); }, Number(process.env.WEB_TURN_SECONDS ?? 45) * 1000);
