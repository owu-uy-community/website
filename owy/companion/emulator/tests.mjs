import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import createRuntime from "../../../public/companion-runtime/owy-runtime.mjs";
import { BOARDS, Session, boot, validateBundle, validateEvent } from "./session.mjs";
import { scenarios } from "./fixtures.mjs";
import { orientation, poseMotion } from "./pose.mjs";
import { verifyArtifacts } from "./provenance.mjs";
const manifest = JSON.parse(readFileSync(new URL("../../../public/companion-runtime/manifest.json", import.meta.url)));
const runtime = await createRuntime();
const s = new Session(runtime, manifest);
const digest = () => createHash("sha256").update(s.frame()).digest("hex");
const input = (type, values = [], text) => s.input({ type, values, text });
test("checked-in browser assets match current firmware, runtime and production bridge", () => {
  verifyArtifacts();
});
test("live presentation cannot export or run fixture inputs and has no fake voice timeout", () => {
  s.beginLive();
  s.liveVisual(2, 0.6, 0);
  s.advance(12000);
  assert.equal(s.snapshot().voice, "listening");
  assert.throws(() => s.export(), /cannot be exported/);
  assert.throws(() => input("wake"), /locked/);
  s.liveVisual(4, 0, 70);
  s.advance(1000);
  assert.equal(s.snapshot().voice, "speaking");
  s.reset();
  assert.equal(s.mode, "simulated");
  assert.equal(s.events.length, 0);
});
test("live bridge screen commands use the actual card/text/QR LVGL widgets", () => {
  s.reset();
  s.beginLive();
  s.liveDevice({ kind: "text", text: "Hola desde el bridge" });
  assert.equal(s.snapshot().page, "text");
  const textPixels = digest();
  s.liveDevice({ kind: "card", card: { title: "Una charla real", speaker: "Ana", room: "Azul", timeSlot: "15:00" } });
  assert.equal(s.snapshot().page, "card");
  assert.notEqual(digest(), textPixels);
  const cardPixels = digest();
  s.liveDevice({ kind: "card", card: { title: "Otra charla", speaker: "Luis", room: "Verde", timeSlot: "17:00" } });
  assert.notEqual(digest(), cardPixels);
  s.liveDevice({ kind: "qr", url: "https://owu.uy/conf", caption: "La grilla" });
  assert.equal(s.snapshot().page, "qr");
  const qrPixels = digest();
  s.liveDevice({ kind: "qr", url: "https://owu.uy/comunidad", caption: "La grilla" });
  assert.notEqual(digest(), qrPixels);
  s.liveDevice({ kind: "volume", value: 35 });
  assert.equal(s.snapshot().settings.volume, 35);
  assert.throws(() => s.export());
  s.reset();
  assert.equal(s.events.length, 0);
});
test("bridge expression cues reshape the speaking face when their sentence is heard", () => {
  // The face never holds still (blinks, springs), so compare against the same
  // deterministic timeline without the cue: any difference is the cue's.
  const run = (command) => {
    s.reset();
    s.beginLive();
    s.liveVisual(4, 0, 0);
    s.advance(1500);
    if (command) s.liveDevice(command);
    const frames = [];
    for (const step of [300, 900, 600]) {
      s.advance(step);
      frames.push(digest());
    }
    assert.equal(s.events.length, 0); // live cues are never recorded for replay
    s.reset();
    return frames;
  };
  const plain = run();
  const surprised = run({ kind: "expression", expression: "surprised", leadMs: 600, strength: 100 });
  assert.equal(surprised[0], plain[0]); // +300 ms: not audible yet
  assert.notEqual(surprised[1], plain[1]); // +1200 ms: eyes wide, small pupils, brows up
  assert.notEqual(surprised[2], plain[2]);
  assert.deepEqual(run({ kind: "expression", expression: "grumpy", leadMs: 0, strength: 100 }), plain); // unknown: ignored
  assert.deepEqual(run({ kind: "expression", expression: "neutral", leadMs: 0, strength: 100 }), plain);
});
test("live touch/BOOT/privacy/calibration route start and stop without synthetic voice or recording", () => {
  s.reset();
  s.beginLive();
  s.liveInput({ type: "boot", values: [100] });
  assert(s.commands.includes("start"));
  s.commands = [];
  s.liveVisual(4, 0, 60);
  s.liveInput({ type: "boot", values: [100] });
  assert(s.commands.includes("stop"));
  s.commands = [];
  s.liveVisual(2, 0.5, 0);
  s.liveInput({ type: "setting", values: [1], text: "privacy" });
  s.liveVisual(2, 0.5, 0);
  assert.equal(s.snapshot().voice, "privacy");
  assert.equal(s.snapshot().phase, 0);
  s.liveInput({ type: "setting", values: [0], text: "privacy" });
  s.liveInput({ type: "calibrate" });
  assert(s.commands.includes("stop"));
  s.liveVisual(2, 0.5, 0);
  assert.equal(s.snapshot().phase, 0);
  s.advance(4000);
  assert.equal(s.snapshot().calibration, "success");
  assert.equal(s.events.length, 0);
  assert.throws(() => s.liveInput({ type: "speech", values: [1, 1000] }), /fixture-only/);
  s.reset();
});
test("live sensor motions and device preferences remain shared, not replay-recorded", () => {
  s.reset();
  input("setting", [40], "volume");
  s.beginLive();
  assert.equal(s.snapshot().settings.volume, 40);
  s.schedule(poseMotion([0, 0, 0], [30, 25, 0], s.time));
  s.advance(1000);
  assert(Math.abs(s.snapshot().gravity[0]) > 0.1);
  assert.equal(s.events.length, 0);
  s.reset();
});
test("all nine real LVGL pages render nonempty exact-size RGB565 buffers", () => {
  for (const page of ["face", "quick", "help", "qr", "pin", "calibration"]) {
    s.reset();
    input("page", [], page);
    s.advance(32);
    assert.equal(s.frame().length, 466 * 466);
    assert(s.frame().some((v) => v !== 0));
    assert.equal(s.snapshot().page, page);
  }
  input("text", [], "Texto de prueba");
  assert.equal(s.snapshot().page, "text");
  input("card", [], "Una charla compartida");
  assert.equal(s.snapshot().page, "card");
});
test("pointer taps use actual LVGL hit testing and shared Contact classifier", () => {
  s.reset();
  s.advance(500);
  input("pointer", [233, 210, 1]);
  s.advance(100);
  input("pointer", [233, 210, 0]);
  s.advance(650);
  assert.equal(s.snapshot().voice, "listening");
  input("pointer", [233, 210, 1]);
  s.advance(100);
  input("pointer", [233, 210, 0]);
  assert.equal(s.snapshot().voice, "wake_word");
});
test("hold opens settings without also starting capture", () => {
  s.reset();
  input("pointer", [233, 210, 1]);
  s.advance(900);
  input("pointer", [233, 210, 0]);
  assert.equal(s.snapshot().page, "quick");
  assert.equal(s.snapshot().voice, "wake_word");
});
test("successful and rejected calibration use real MotionTracker code", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "calibration").events);
  s.advance(7500);
  assert.equal(s.snapshot().calibration, "success");
  assert(Math.abs(s.snapshot().bias[0] - 2) < 0.001);
  assert(Math.abs(s.snapshot().neutral[0] - 0.3) < 0.001);
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "calibration-motion").events);
  s.advance(18000);
  assert.equal(s.snapshot().calibration, "timeout");
});
test("modeled power cycle retains explicit calibration and persistent preferences only", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "calibration").events);
  s.advance(7500);
  const neutral = s.snapshot().neutral;
  input("setting", [35], "volume");
  input("setting", [1], "quiet");
  input("setting", [1], "pitch");
  input("power", [0]);
  input("power", [1]);
  assert.deepEqual(s.snapshot().neutral, neutral);
  assert.equal(s.snapshot().settings.volume, 35);
  assert.equal(s.snapshot().settings.quiet, 0);
  assert.equal(s.snapshot().settings.staff, 0);
  assert.equal(s.snapshot().settings.pitch, 1); // like the firmware's persisted switch
  assert.equal(s.snapshot().pitchActive, false);
});
test("modo pitch: a tap records past the silent-window guard, the second tap sends it, nothing follows up", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "pitch").events);
  s.advance(12000);
  assert.equal(s.snapshot().voice, "recording");
  assert.equal(s.snapshot().pitchActive, true);
  s.advance(8000);
  const events = s.trace.map((x) => x.event);
  assert(events.includes("pitch.submit") && events.includes("bridge.pitch_submit"));
  assert.equal(events.filter((x) => x === "tts.started").length, 1);
  for (const absent of ["guard.local_silence", "conversation.silent_idle", "voice.cancelled", "voice.follow_up.request"])
    assert(!events.includes(absent), absent);
  assert.equal(s.snapshot().voice, "idle"); // no wake word in modo pitch
  assert.equal(s.snapshot().pitchActive, false);
});
test("modo pitch live: taps become start:pitch / commit, the bridge's prompt re-tags the next tap and expires", () => {
  s.reset();
  s.beginLive();
  s.liveInput({ type: "setting", values: [1], text: "pitch" });
  s.liveInput({ type: "boot", values: [100] });
  assert.deepEqual(s.commands.splice(0), ["start:pitch"]);
  s.liveVisual(2, 0.4, 0);
  assert.equal(s.snapshot().voice, "recording");
  s.liveInput({ type: "boot", values: [100] });
  assert.deepEqual(s.commands.splice(0), ["commit"]);
  s.liveVisual(4, 0, 60);
  s.liveVisual(0, 0, 0);
  assert.equal(s.snapshot().pitchActive, false);
  s.liveDevice({ kind: "pitchPrompt", prompt: "name" });
  assert(s.snapshot().promptDeadline > 0);
  s.liveInput({ type: "boot", values: [100] });
  assert.deepEqual(s.commands.splice(0), ["start:pitch-name"]);
  assert.equal(s.snapshot().promptDeadline, 0);
  s.liveDevice({ kind: "pitchPrompt", prompt: "name" });
  s.advance(21000);
  assert.equal(s.snapshot().promptDeadline, 0);
  assert.equal(s.events.length, 0);
  s.reset();
});
test("continuous fixture has three replies and then closes for silence", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "conversation").events);
  s.advance(20500);
  assert.equal(s.snapshot().voice, "wake_word");
  assert.equal(s.trace.filter((x) => x.event === "tts.started").length, 3);
  assert.equal(s.trace.filter((x) => x.event === "bridge.TTS_START").length, 3);
  assert.equal(s.trace.filter((x) => x.event === "bridge.TTS_END").length, 3);
  assert.equal(s.trace.filter((x) => x.event === "speaker.stopped").length, 3);
});
test("real bridge/pacer retain all 640000 bytes through a 700 ms modeled transport stall", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "transport").events);
  s.advance(23500);
  assert.equal(s.snapshot().audioReceived, 640000);
  assert.equal(s.snapshot().voice, "wake_word");
  assert(s.trace.some((e) => e.event.startsWith("transport.burst.")));
  assert(!s.trace.some((e) => e.event === "fault.receive_buffer_full"));
});
test("real VoiceTurn readiness gate fails cleanly without opening TTS", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "ready-timeout").events);
  s.advance(8000);
  assert(s.trace.some((e) => e.event === "bridge.ERROR"));
  assert(!s.trace.some((e) => e.event === "bridge.TTS_START"));
  assert.equal(s.snapshot().voice, "wake_word");
});
test("oversized transport burst is a reproducible negative control, not a fake pass", () => {
  s.reset();
  input("setting", [0], "continuous");
  input("transport", [1500, 0]);
  input("wake");
  s.advance(1000);
  input("speech", [1, 6000]);
  s.advance(7000);
  assert(s.trace.some((e) => e.event === "fault.receive_buffer_full"));
  assert.equal(s.snapshot().voice, "wake_word");
});
test("interaction cue has exclusive ownership, cooldown, and privacy cancellation", () => {
  s.reset();
  s.advance(500);
  input("pet");
  assert.equal(s.snapshot().voice, "feedback");
  input("wake");
  assert.equal(s.snapshot().voice, "wake_word");
  input("pet");
  assert.equal(s.snapshot().voice, "wake_word");
  s.advance(4000);
  input("pet");
  assert.equal(s.snapshot().voice, "feedback");
  input("setting", [1], "privacy");
  assert.equal(s.snapshot().voice, "privacy");
});
test("replay is independent of host frame chunk sizes, including real bridge timers", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "conversation").events);
  for (let i = 0; i < 1000; i++) s.advance(17);
  const state = s.snapshot(),
    frame = digest(),
    record = s.export();
  s.import(record);
  s.advance(17000);
  assert.deepEqual(s.snapshot(), state);
  assert.equal(digest(), frame);
});
test("privacy cancels and blocks wake, modeled drain does not mean STOPPED", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "privacy").events);
  s.advance(6000);
  assert.equal(s.snapshot().voice, "privacy");
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "drain").events);
  s.advance(8000);
  assert.equal(s.snapshot().voice, "draining");
  assert(s.snapshot().why.includes("STOPPED"));
});
test("staff page cannot be directly injected; fixture PIN and expiry", () => {
  s.reset();
  assert.throws(() => input("page", [], "staff"));
  input("page", [], "pin");
  for (const key of ["1", "2", "3", "4", "OK"]) input("pin", [], key);
  assert.equal(s.snapshot().page, "staff");
  assert.equal(s.snapshot().settings.staff, 1);
  s.advance(600000);
  assert.equal(s.snapshot().settings.staff, 0);
});
test("replay reproduces pixel and complete observable state at exact virtual time", () => {
  s.reset();
  s.schedule(scenarios.find((x) => x.id === "hello").events);
  s.advance(6500);
  const frame = digest(),
    state = s.snapshot(),
    record = s.export();
  s.import(record);
  s.advance(6500);
  assert.deepEqual(s.snapshot(), state);
  assert.equal(digest(), frame);
  s.seek(3100);
  const a = digest();
  s.seek(3100);
  assert.equal(digest(), a);
});
test("shared PCM is bounded, repeatable, zero-ended 16 kHz PCM16", () => {
  for (let kind = 0; kind < 3; kind++) {
    const bytes = s.pcm(kind);
    assert.equal(bytes.length, 2560);
    assert.deepEqual(bytes, s.pcm(kind));
    assert.equal(bytes[0] | bytes[1] | bytes[2558] | bytes[2559], 0);
    const v = new DataView(bytes.buffer);
    for (let i = 0; i < 1280; i++) assert(Math.abs(v.getInt16(i * 2, true)) < 2600);
  }
});
test("speaking envelope drives the shared mouth renderer and records for replay", () => {
  s.reset();
  input("mood", [3]);
  input("envelope", [0, 0]);
  s.advance(1000);
  const closed = digest();
  s.reset();
  input("mood", [3]);
  input("envelope", [0, 90]);
  s.advance(1000);
  assert.notEqual(digest(), closed);
  assert.deepEqual(s.snapshot().envelope, [0, 90]);
  const frame = digest(),
    record = s.export();
  s.import(record);
  s.advance(1000);
  assert.equal(digest(), frame);
});
test("replay import rejects incompatible versions, oversized input and invalid fields", () => {
  s.reset();
  const bundle = JSON.parse(s.export());
  assert.throws(() => validateBundle(JSON.stringify({ ...bundle, version: "other" }), s.version));
  assert.throws(() => validateBundle("x".repeat(2 * 1024 * 1024 + 1), s.version));
  assert.throws(() => validateEvent({ t: 0, type: "__proto__" }));
  assert.throws(() => validateEvent({ t: 0, type: "imu", values: [NaN, 0, 1, 0, 0, 0] }));
  assert.throws(() => validateEvent({ t: 0, type: "pointer", values: [500, 0, 1] }));
  assert.throws(() => validateEvent({ t: 0, type: "setting", values: [1], text: "staff" }));
});
test("pose adapter: normalized rotation, correct gravity and gyro sign", () => {
  assert(Math.abs(Math.hypot(...orientation([25, 30, 40])) - 1) < 1e-9);
  const motion = poseMotion([0, 0, 0], [90, 0, 0], 0, 1000);
  assert(motion.some((e) => e.values[3] > 0));
  assert(Math.abs(motion.at(-1).values[1] - 1) < 1e-8);
  const yaw = poseMotion([0, 0, 0], [0, 0, 90], 0, 1000);
  assert(yaw.every((e) => Math.abs(e.values[2] - 1) < 1e-8));
  assert(yaw.some((e) => e.values[5] > 0));
});

// ---------------------------------------------------------------------------
// Face-only mode (the wall, the talk deck): the same renderer, any size
// ---------------------------------------------------------------------------

/** owy::Mood and owy::Expression, in their numeric order (companion_model.h). */
const MOODS = ["idle", "listening", "thinking", "speaking", "happy", "error", "offline", "privacy", "followup", "sleep", "record", "invite"];
const EXPRESSIONS = ["neutral", "happy", "excited", "curious", "thinking", "empathetic", "playful", "surprised"];
/** The wall face is 886 px (466 × 1.9); 360 is the knob's own panel. */
const BOARD_AT = { 466: "amoled", 360: "knob", 886: "amoled" };
const GOLDENS = new URL("./goldens.json", import.meta.url);
const face = await createRuntime();
function send(module, kind, values = [], text = "") {
  const ptr = module._malloc(text.length + 1);
  module.stringToUTF8(text, ptr, text.length + 1);
  module._owy_input(kind, ...[...values, 0, 0, 0, 0, 0, 0].slice(0, 6), ptr);
  module._free(ptr);
}
const screen = (module, size) => module.HEAPU16.subarray(module._owy_pixels() / 2, module._owy_pixels() / 2 + size * size);
const hash = (pixels) => createHash("sha256").update(pixels).digest("hex");
function png(module, size) {
  const rgba = module.HEAPU8.subarray(module._owy_rgba(), module._owy_rgba() + size * size * 4);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rows.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header.set([8, 6], 8); // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
/** A face-only frame: 2 s after boot, then 1.5 s after the mood (and the expression) was set. */
function render(size, mood, expression, reduced = false) {
  boot(face, 0x4f5759, BOARD_AT[size], size, true);
  if (reduced) send(face, 3, [1], "reduced");
  face._owy_advance(2000);
  send(face, 18, [mood]);
  if (expression !== undefined) send(face, 37, [expression, 0, 100]);
  face._owy_advance(1500);
  return screen(face, size);
}
const cases = [
  ...MOODS.map((name, mood) => [name, mood]),
  ...["speaking", "thinking"].flatMap((state) => EXPRESSIONS.map((name, e) => [`${state}+${name}`, MOODS.indexOf(state), e])),
  // Reduced motion holds still (no blinks, saccades or springs): what a device capture can match.
  ...MOODS.map((name, mood) => [`reduced:${name}`, mood, undefined, true]),
];
test("face-only draws the device emulator's exact pixels at 466 through a live turn", () => {
  s.reset();
  s.beginLive();
  boot(face, s.seed, "amoled", 466, true);
  const both = (kind, values, text) => (s.raw(kind, values, text), send(face, kind, values, text));
  const advance = (ms) => (s.advance(ms), face._owy_advance(ms));
  // The emulator's boot logo and its volume overlay (beginLive replays the settings) are gone by 3 s.
  advance(3000);
  // ms, then input: the presentation a live turn sends (phase/mic/speaker), its feelings, lips and moods.
  const script = [
    [0, 33, [2, 0.6, 0]],
    [900, 33, [2, 0.2, 0]],
    [700, 33, [3, 0, 0]],
    [300, 37, [4, 200, 80]],
    [800, 33, [4, 0, 0]],
    [0, 39, [80], "AAQgw-_8QgAQgwAAAQgw8_-QgA"],
    [400, 37, [7, 300, 100]],
    [900, 39, [0], "gw8_-QgAAAQgw8"],
    [700, 33, [0, 0, 0]],
    [600, 18, [4]],
    [1200, 18, [6]],
    [1500, 18, [5]],
    [1300, 18, [0]],
  ];
  // The idle hint under the mouth is the emulator's alone: its rows are masked.
  const masked = (pixels) => hash(pixels.map((v, i) => (Math.floor(i / 466) >= 396 && Math.floor(i / 466) < 432 ? 0 : v)));
  let checked = 0;
  for (const [ms, kind, values, text] of script) {
    for (let t = 0; t < ms; t += 100) {
      advance(Math.min(100, ms - t));
      assert.equal(masked(screen(face, 466)), masked(s.frame()), `diverged at ${s.time} ms`);
      checked++;
    }
    both(kind, values, text);
  }
  advance(1000);
  assert.equal(masked(screen(face, 466)), masked(s.frame()));
  assert(checked > 80);
  s.reset();
});
test("face goldens: moods and expressions at 466 (AMOLED), 360 (knob) and 886 (the wall); UPDATE_GOLDENS=1 rewrites", () => {
  const golden = existsSync(GOLDENS) ? JSON.parse(readFileSync(GOLDENS, "utf8")) : {};
  const actual = {},
    changed = [],
    dump = join(tmpdir(), "owy-face-goldens");
  for (const size of [466, 360, 886]) {
    actual[size] = {};
    for (const [key, mood, expression, reduced] of cases) {
      actual[size][key] = hash(render(size, mood, expression, reduced));
      if (golden[size]?.[key] === actual[size][key]) continue;
      changed.push(`${size}/${key}`);
      mkdirSync(dump, { recursive: true });
      writeFileSync(join(dump, `${size}-${key.replace(/[:+]/g, "-")}.png`), png(face, size));
    }
  }
  assert.notEqual(actual[886]["speaking+surprised"], actual[886].speaking);
  if (process.env.UPDATE_GOLDENS) writeFileSync(GOLDENS, JSON.stringify(actual, null, 2) + "\n");
  else assert.deepEqual(changed, [], `Face pixels changed; PNGs in ${dump}. UPDATE_GOLDENS=1 if intended.`);
  // The site's fallback face (<OwyFace> when a browser cannot run the worker): a real idle frame.
  render(466, 0);
  writeFileSync(new URL("../../../public/companion-runtime/face.png", import.meta.url), png(face, 466));
});
test("knob captures match the knob's reduced-motion goldens (KNOB_SHOTS=<dir of knob-shots.py .rgb565>)", { skip: !process.env.KNOB_SHOTS }, () => {
  // Name each capture after its golden, e.g. `knob-shots.py --name reduced.idle` with the knob in that face
  // and «Animaciones mínimas» on. The rim (animated) and everything under the mouth (hint, badge) are masked.
  const [size, , ring, dot] = BOARDS.knob;
  const golden = JSON.parse(readFileSync(GOLDENS, "utf8"))[size];
  const shots = readdirSync(process.env.KNOB_SHOTS).filter((name) => /-reduced\.[a-z]+\.rgb565$/.test(name));
  assert(shots.length > 0, "No *-reduced.<mood>.rgb565 captures");
  const keep = (i) => {
    const x = (i % size) - size / 2 + 0.5,
      y = Math.floor(i / size) - size / 2 + 0.5;
    return Math.floor(i / size) < 300 && Math.abs(Math.hypot(x, y) - ring) > dot;
  };
  for (const name of shots) {
    const key = `reduced:${/-reduced\.([a-z]+)\.rgb565$/.exec(name)[1]}`;
    assert(golden[key], `${name}: no golden ${key}`);
    const bytes = readFileSync(join(process.env.KNOB_SHOTS, name));
    const device = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    const web = render(size, MOODS.indexOf(key.slice(8)), undefined, true);
    let differ = 0;
    for (let i = 0; i < size * size; i++) if (keep(i) && device[i] !== web[i]) differ++;
    assert.equal(differ, 0, `${name}: ${differ} px differ from the web face`);
  }
});
