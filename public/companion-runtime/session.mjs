// Deterministic, bounded fixture/replay protocol. The browser owns no device
// credentials, microphone, network tools, or production mutation authority.
import { FixtureBridge } from "./bridge.mjs";
export const MAX_TIME = 600000;
export const MAX_EVENTS = 20000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const settings = new Set([
  "privacy",
  "motion",
  "reduced",
  "invert_x",
  "invert_y",
  "continuous",
  "chime",
  "sounds",
  "wake",
  "quiet",
  "volume",
  "brightness",
  "marketplace",
]);
const pages = new Set(["face", "quick", "help", "qr", "pin", "calibration"]); // staff only through fixture PIN
const kinds = {
  imu: 1,
  pointer: 2,
  setting: 3,
  wake: 4,
  boot: 5,
  speech: 6,
  page: 7,
  calibrate: 8,
  center: 9,
  connection: 10,
  imuAvailable: 11,
  fault: 12,
  envelope: 13,
  powerTelemetry: 14,
  cue: 15,
  pin: 16,
  power: 17,
  mood: 18,
  text: 19,
  card: 20,
  pet: 21,
  transport: 22,
};
export function validateEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw Error("Invalid input event");
  if (!Number.isSafeInteger(event.t) || event.t < 0 || event.t > MAX_TIME)
    throw Error("Event time must be 0–600000 ms");
  if (!Object.hasOwn(kinds, event.type)) throw Error("Unknown input type");
  const values = event.values ?? [];
  if (
    !Array.isArray(values) ||
    values.length > 6 ||
    values.some((v) => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1e6)
  )
    throw Error("Invalid numeric input");
  const text = event.text ?? "";
  if (typeof text !== "string" || text.length > 512 || /[\u0000-\u0008\u000b-\u001f]/.test(text))
    throw Error("Invalid text input");
  if (event.type === "setting" && !settings.has(text)) throw Error("Unknown setting");
  if (event.type === "page" && !pages.has(text)) throw Error("Page is unavailable or requires PIN");
  if (event.type === "pin" && !/^(C|OK|[0-9])$/.test(text)) throw Error("Invalid fixture PIN key");
  const lengths = {
    imu: 6,
    pointer: 3,
    setting: 1,
    boot: 1,
    speech: 2,
    connection: 1,
    imuAvailable: 1,
    fault: 3,
    envelope: 2,
    powerTelemetry: 4,
    cue: 1,
    power: 1,
    mood: 1,
    transport: 2,
  };
  if (values.length !== (lengths[event.type] ?? 0)) throw Error("Wrong number of input values");
  if (
    event.type === "pointer" &&
    (values[0] < 0 || values[0] > 465 || values[1] < 0 || values[1] > 465 || ![0, 1].includes(values[2]))
  )
    throw Error("Pointer outside panel");
  return { t: event.t, type: event.type, values: [...values], ...(text ? { text } : {}) };
}
export function validateBundle(raw, version) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_IMPORT_BYTES)
    throw Error("Replay exceeds 2 MiB");
  const input = JSON.parse(raw);
  if (input?.schema !== 1 || input.version !== version)
    throw Error("Replay was made with a different runtime. Rebuild or use the matching version.");
  if (!Number.isSafeInteger(input.seed) || input.seed < 1 || input.seed > 0xffffffff) throw Error("Invalid seed");
  if (!Number.isSafeInteger(input.duration) || input.duration < 0 || input.duration > MAX_TIME)
    throw Error("Replay duration exceeds 10 minutes");
  if (!Array.isArray(input.events) || input.events.length > MAX_EVENTS)
    throw Error("Replay exceeds 20000 input events");
  let last = 0;
  const events = input.events.map((e) => {
    const v = validateEvent(e);
    if (v.t < last || v.t > input.duration) throw Error("Replay events are out of order");
    last = v.t;
    return v;
  });
  return { schema: 1, version, seed: input.seed, duration: input.duration, events };
}
export class Session {
  constructor(module, manifest) {
    this.module = module;
    this.manifest = manifest;
    this.version = `${manifest.version}:${manifest.wasmHash}`;
    this.reset();
  }
  reset(seed = 0x4f5759) {
    this.bridge?.stop();
    this.seed = seed;
    this.module._owy_init(seed);
    this.time = 0;
    this.events = [];
    this.trace = [];
    this.pending = [];
    this.mode = "simulated";
    this.duration = 0;
    this.lastSerial = -1;
    this.lastCue = 0;
    this.cues = [];
    this.commands = [];
    this.bridge = new FixtureBridge((kind, values) => this.raw(kind, values));
    this.raw(32, []);
    this.observe();
  }
  snapshot() {
    const state = JSON.parse(this.module.UTF8ToString(this.module._owy_snapshot()));
    return {
      ...state,
      audioReceived: this.module._owy_audio_received(),
      audioBuffered: this.module._owy_audio_buffered(),
    };
  }
  observe() {
    const state = this.snapshot();
    this.time = state.time;
    this.duration = Math.max(this.duration, this.time);
    if (this.mode !== "live") this.bridge.observe(state);
    const events = JSON.parse(this.module.UTF8ToString(this.module._owy_trace()));
    if (this.mode === "live")
      for (const e of events) {
        if (e.event === "voice.request") this.commands.push("start");
        if (["voice.cancelled", "calibration.started", "power.off", "fixture.reboot"].includes(e.event))
          this.commands.push("stop");
      }
    this.trace.push(...events, ...this.bridge.events.splice(0));
    this.trace.sort((a, b) => a.t - b.t);
    if (this.trace.length > 3000) this.trace.splice(0, this.trace.length - 3000);
    if (state.cueSerial !== this.lastCue) {
      this.lastCue = state.cueSerial;
      this.cues.push({ kind: state.cueKind, volume: state.settings.volume, t: this.time });
    }
  }
  raw(kind, values, text = "") {
    const size = new TextEncoder().encode(text).length + 1;
    const ptr = this.module._malloc(size);
    try {
      this.module.stringToUTF8(text, ptr, size);
      const v = [...values];
      while (v.length < 6) v.push(0);
      this.module._owy_input(kind, ...v, ptr);
    } finally {
      this.module._free(ptr);
    }
  }
  dispatch(e) {
    if (e.type === "speech") this.bridge.speech(...e.values);
    else if (e.type === "transport") {
      this.bridge.transportStall = Math.max(0, Math.min(2000, e.values[0]));
      this.bridge.readyFault = !!e.values[1];
    } else {
      if (e.type === "fault") this.bridge.hung = !!e.values[2];
      this.raw(kinds[e.type], e.values, e.text);
    }
    this.observe();
  }
  input(raw) {
    if (this.mode !== "simulated") throw Error("Live/replay inputs are locked. Reset to start a new simulation.");
    if (this.events.length >= MAX_EVENTS) throw Error("Recording limit reached. Export and reset.");
    const e = validateEvent({ ...raw, t: this.time });
    this.events.push(e);
    this.dispatch(e);
  }
  schedule(events) {
    this.pending = events.map(validateEvent).sort((a, b) => a.t - b.t);
  }
  advance(ms) {
    const target = Math.min(
      MAX_TIME,
      this.mode === "replay" ? this.duration : MAX_TIME,
      this.time + Math.max(0, Math.floor(ms))
    );
    while (this.time < target || this.pending[0]?.t === this.time) {
      while (this.pending.length && this.pending[0].t <= this.time) {
        const e = this.pending.shift();
        if (this.mode === "simulated") {
          if (this.events.length >= MAX_EVENTS) throw Error("Recording limit reached");
          this.events.push(e);
        }
        this.dispatch(e);
      }
      if (this.time >= target) break;
      const step = Math.min(16, target - this.time, this.pending.length ? this.pending[0].t - this.time : 16);
      for (let i = 0; i < step; i++) {
        this.module._owy_advance(1);
        ++this.time;
        if (this.mode !== "live") {
          this.bridge.advance(this.time);
          if (this.module._owy_phase() !== this.bridge.state.phase) this.bridge.observe(this.snapshot());
        }
      }
      this.observe();
    }
    return this.snapshot();
  }
  export() {
    if (this.mode === "live") throw Error("Live audio sessions cannot be exported.");
    return JSON.stringify(
      { schema: 1, version: this.version, seed: this.seed, duration: this.duration, events: this.events },
      null,
      2
    );
  }
  beginLive() {
    const preferences = this.snapshot().settings;
    this.reset();
    this.bridge.stop();
    this.mode = "live";
    this.raw(34, [1]);
    for (const [key, value] of Object.entries(preferences)) if (settings.has(key)) this.raw(3, [value], key);
    this.observe();
    this.commands = [];
    this.trace = [];
  }
  liveInput(raw) {
    if (this.mode !== "live") return;
    const e = validateEvent({ ...raw, t: this.time });
    if (
      ![
        "imu",
        "pointer",
        "setting",
        "wake",
        "boot",
        "page",
        "calibrate",
        "center",
        "imuAvailable",
        "powerTelemetry",
        "cue",
        "pin",
        "power",
        "mood",
        "pet",
      ].includes(e.type)
    )
      throw Error("This input is fixture-only");
    this.raw(kinds[e.type], e.values, e.text);
    this.observe();
  }
  liveDevice(command) {
    if (this.mode !== "live" || !command || typeof command !== "object") return;
    const text = (value, max = 512) =>
      typeof value === "string" ? value.slice(0, max).replace(/[\u0000-\u0008\u000b-\u001f]/g, "") : "";
    if (command.kind === "bridgeEvent" && /^[A-Z_]{1,64}$/.test(command.event) && Number.isSafeInteger(command.run)) {
      this.trace.push({
        t: this.time,
        event: `bridge.${command.event} #${command.run}`,
        page: "bridge",
        voice: this.snapshot().voice,
      });
    } else if (command.kind === "text") this.raw(19, [], text(command.text));
    else if (command.kind === "card") {
      const card = command.card ?? {};
      this.raw(35, [0], text(card.title));
      this.raw(35, [1], text(card.speaker));
      this.raw(35, [2], [text(card.room), text(card.timeSlot)].filter(Boolean).join(" · "));
      this.raw(35, [3]);
    } else if (command.kind === "qr") {
      const url = text(command.url);
      if (!/^https?:\/\//.test(url)) throw Error("Invalid QR URL");
      this.raw(36, [0], url);
      this.raw(36, [1], text(command.caption));
    } else if (command.kind === "volume" && Number.isFinite(command.value)) this.raw(3, [command.value], "volume");
    else if (command.kind === "face") {
      const moods = { idle: 0, happy: 4, error: 5, offline: 6 };
      if (Object.hasOwn(moods, command.state)) this.raw(18, [moods[command.state]]);
    }
    this.observe();
  }
  liveVisual(phase, mic, speaker) {
    if (this.mode !== "live") return;
    if (![0, 2, 3, 4].includes(phase) || ![mic, speaker].every(Number.isFinite))
      throw Error("Invalid live presentation");
    this.raw(33, [phase, mic, speaker]);
  }
  import(raw) {
    const b = validateBundle(raw, this.version);
    this.reset(b.seed);
    this.mode = "replay";
    this.events = b.events;
    this.duration = b.duration;
    this.schedule(b.events);
    this.advance(0);
  }
  seek(time) {
    const raw = this.export();
    this.import(raw);
    this.advance(Math.min(time, this.duration));
    this.cues = [];
  }
  frame() {
    return this.module.HEAPU16.slice(this.module._owy_pixels() / 2, this.module._owy_pixels() / 2 + 466 * 466);
  }
  pcm(kind) {
    const ptr = this.module._owy_cue(kind);
    return this.module.HEAPU8.slice(ptr, ptr + this.module._owy_cue_size());
  }
}
