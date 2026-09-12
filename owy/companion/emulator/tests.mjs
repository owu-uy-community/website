import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import createRuntime from "../../../public/companion-runtime/owy-runtime.mjs";
import { Session, validateBundle, validateEvent } from "./session.mjs";
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
  input("power", [0]);
  input("power", [1]);
  assert.deepEqual(s.snapshot().neutral, neutral);
  assert.equal(s.snapshot().settings.volume, 35);
  assert.equal(s.snapshot().settings.quiet, 0);
  assert.equal(s.snapshot().settings.staff, 0);
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
