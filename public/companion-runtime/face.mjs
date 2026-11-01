// One Owy face for the web (the wall, the talk deck, the workbench's knob): the
// firmware's own model and FaceRenderer in face-only mode, drawn into a
// transferred OffscreenCanvas. Messages:
//   init {canvas, size, board, fps, lag}   lag: ms the picture runs late (positive = act earlier)
//   state {state}                           idle | listening | thinking | speaking | happy | error | offline
//   mood {mood}                             a raw owy::Mood 0..11 (the workbench mirrors its emulator)
//   express {name, strength, at}            at: epoch ms when the sentence becomes audible
//   smile · mouth {frames, at} · stats
// Posts {type:"frame"} after the first painted frame, {type:"error"} if it cannot run.
import createRuntime from "./owy-runtime.mjs";
import { MOUTH_FRAMES, boot, paint } from "./session.mjs";

const EXPRESSIONS = ["neutral", "happy", "excited", "curious", "thinking", "empathetic", "playful", "surprised"];
const PHASES = { listening: 2, thinking: 3, speaking: 4 };
const MOODS = { idle: 0, happy: 4, error: 5, offline: 6 };
const SPEAKING = 3;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

let module, ctx, size, lag, period, clock, timer;
const cache = {};
const cost = { frames: 0, total: 0, worst: 0 };
let speaking = false,
  lastMouth = 0,
  babbleUntil = 0,
  seed = 0x9e3779b9;
const syllables = [];

function raw(kind, values = [], text = "") {
  const bytes = new TextEncoder().encode(text);
  const ptr = module._malloc(bytes.length + 1);
  try {
    module.HEAPU8.set(bytes, ptr);
    module.HEAPU8[ptr + bytes.length] = 0;
    const v = [...values, 0, 0, 0, 0, 0, 0].slice(0, 6);
    module._owy_input(kind, ...v, ptr);
  } finally {
    module._free(ptr);
  }
}

// A plausible mouth for lines with no audio to follow (scripted scenes, a wall without the
// bridge's frames): words of 1–4 syllables, a short gap between them, in the bridge's codec.
function babble() {
  if (!syllables.length) {
    const rand = () => ((seed ^= seed << 13), (seed ^= seed >>> 17), (seed ^= seed << 5), (seed >>> 0) / 2 ** 32);
    for (let n = 1 + Math.floor(rand() * 4); n > 0; n--) {
      const loud = 0.6 + rand() * 0.4,
        shape = Math.floor(rand() * 4);
      syllables.push([0.35 * loud, shape], [loud, shape], [0.5 * loud, shape]);
    }
    for (let n = Math.floor(rand() * 3); n > 0; n--) syllables.push([0, 1]);
  }
  const [open, shape] = syllables.shift();
  return ALPHABET[(Math.round(open * 15) << 2) | shape];
}

function tick() {
  const start = performance.now();
  // A throttled tab skips ahead instead of fast-forwarding.
  const elapsed = start - clock,
    ms = Math.min(250, Math.floor(elapsed));
  clock = elapsed > 250 ? start : clock + ms;
  const now = Date.now();
  // Real frames for this line win; without any for 1 s (or ever), the face babbles.
  if (speaking && now - lastMouth > (lastMouth ? 1000 : 0) && babbleUntil < now + 120) {
    const from = Math.max(babbleUntil, now);
    raw(39, [from - now], Array.from({ length: 5 }, babble).join(""));
    babbleUntil = from + 200;
  }
  if (ms > 0) module._owy_advance(ms);
  paint(module, ctx, size, cache);
  const spent = performance.now() - start;
  cost.frames++;
  cost.total += spent;
  cost.worst = Math.max(cost.worst, spent);
  timer = setTimeout(tick, Math.max(0, period - spent));
}

const handlers = {
  state({ state }) {
    if (Object.hasOwn(PHASES, state)) raw(33, [PHASES[state], 0, 0]);
    else if (Object.hasOwn(MOODS, state)) {
      // The mood first: it only shows once the phase is idle, so no in-between frame.
      raw(18, [MOODS[state]]);
      raw(33, [0, 0, 0]);
    } else return;
    speaking = state === "speaking";
  },
  mood({ mood }) {
    if (!Number.isInteger(mood) || mood < 0 || mood > 11) return;
    raw(18, [mood]);
    raw(33, [0, 0, 0]);
    speaking = mood === SPEAKING;
  },
  express({ name, strength = 100, at }) {
    const index = EXPRESSIONS.indexOf(name);
    if (index < 0 || !Number.isFinite(strength)) return;
    const lead = Number.isFinite(at) ? at - Date.now() - lag : 0;
    raw(37, [index, Math.max(-2000, Math.min(5000, lead)), Math.max(0, Math.min(100, strength))]);
  },
  smile() {
    raw(21);
  },
  mouth({ frames, at }) {
    if (typeof frames !== "string" || !MOUTH_FRAMES.test(frames) || !Number.isFinite(at)) return;
    lastMouth = Date.now();
    raw(39, [at - lastMouth - lag], frames);
  },
  stats() {
    postMessage({ type: "stats", frames: cost.frames, average: cost.total / Math.max(1, cost.frames), worst: cost.worst });
  },
};

async function init({ canvas, size: px, board, fps = 60, lag: late = 0 }) {
  module = await createRuntime();
  size = boot(module, (Math.random() * 0xfffffffe + 1) >>> 0, board, px, true).size;
  canvas.width = canvas.height = size;
  ctx = canvas.getContext("2d");
  lag = Number.isFinite(late) ? Math.max(-2000, Math.min(2000, late)) : 0;
  period = 1000 / Math.max(1, Math.min(60, fps));
  paint(module, ctx, size, cache, true);
  postMessage({ type: "frame" });
  clock = performance.now();
  tick();
}

let ready;
self.onmessage = async ({ data }) => {
  try {
    if (data?.type === "init") ready ??= init(data);
    if (!ready) return;
    // Messages wait for the runtime, in order.
    await ready;
    handlers[data?.type]?.(data);
  } catch (error) {
    clearTimeout(timer);
    postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
