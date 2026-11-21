// One Owy face for the web (the wall, the talk deck, the knob's twin): the firmware's own model
// and FaceRenderer drawn into a transferred OffscreenCanvas. Face-only by default: the face alone
// at `size` px. With `device: true`, the knob's whole screen at its own 360 px (`size` and `board`
// are ignored; the page scales the canvas): its hint, the pausa badge, the answer view and the pages
// the bridge shows. Messages:
//   init {canvas, size, board, fps, lag, device}   lag: ms the picture runs late (positive = act earlier)
//   state {state}                 idle | listening | thinking | speaking | happy | error | offline
//   mood {mood}                   a raw owy::Mood 0..11 (the workbench mirrors its emulator)
//   level {level}                 the Mac mic 0..100 while Owy listens (the halo); ignored in any other state
//   privacy {on} · reduced {on}   pausa (Owy's privacy face over everything) · reduced motion
//   express {name, strength, at}  at: epoch ms when the sentence becomes audible
//   smile · mouth {frames, at} · stats
//   device only, what the bridge shows on the knob: caption {text} · heard {text} ·
//   card {title, speaker?, room?, timeSlot?} · text {body} · qr {url, caption?}
// Posts {type:"frame"} after the first painted frame, {type:"error"} if it cannot run, and
// {type:"stats", frames, average, worst, snapshot} for stats (snapshot: the runtime's owy_snapshot).
import createRuntime from "./owy-runtime.mjs";
import { MOUTH_FRAMES, boot, paint } from "./session.mjs";

const EXPRESSIONS = ["neutral", "happy", "excited", "curious", "thinking", "empathetic", "playful", "surprised"];
const PHASES = { listening: 2, thinking: 3, speaking: 4 };
const MOODS = { idle: 0, happy: 4, error: 5, offline: 6 };
const SPEAKING = 3;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** Between a message's fields (the runtime splits on it); stripped from inside them. */
const SEP = "\x1f";

let module, ctx, size, lag, period, clock, timer;
let device = false;
const cache = {};
const cost = { frames: 0, total: 0, worst: 0 };
let speaking = false,
  lastMouth = 0,
  babbleUntil = 0,
  seed = 0x9e3779b9;
const syllables = [];
/** The state the page last set (null after a raw mood), and when the last mic level came (0: none to drop). */
let current = "idle",
  levelAt = 0;

function raw(kind, values = [], text = "") {
  // The runtime bounds every string; this only keeps a runaway one out of WASM memory.
  const bytes = new TextEncoder().encode(text.slice(0, 16384));
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

/** A multi-field message: each field a string (anything else is empty). */
const fields = (...values) => values.map((v) => (typeof v === "string" ? v.replaceAll(SEP, "") : "")).join(SEP);

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
  // Real frames for this line win; without any for 1 s (or ever), the face babbles. Not the
  // knob's twin: the knob's mouth only moves with the bridge's frames.
  if (!device && speaking && now - lastMouth > (lastMouth ? 1000 : 0) && babbleUntil < now + 120) {
    const from = Math.max(babbleUntil, now);
    raw(39, [from - now], Array.from({ length: 5 }, babble).join(""));
    babbleUntil = from + 200;
  }
  // The knob's model forgets a mic level older than 200 ms; the runtime keeps the last one, so a
  // mic that goes quiet (no level for 300 ms) drops to 0, once.
  if (levelAt && start - levelAt > 300) {
    levelAt = 0;
    raw(33, [2, 0, 0]);
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
    current = state;
    levelAt = 0;
    speaking = state === "speaking";
  },
  mood({ mood }) {
    if (!Number.isInteger(mood) || mood < 0 || mood > 11) return;
    raw(18, [mood]);
    raw(33, [0, 0, 0]);
    current = null;
    levelAt = 0;
    speaking = mood === SPEAKING;
  },
  level({ level }) {
    if (current !== "listening" || !Number.isFinite(level)) return;
    raw(33, [2, Math.max(0, Math.min(100, level)) / 100, 0]);
    levelAt = performance.now();
  },
  privacy({ on }) {
    raw(40, [on ? 1 : 0]);
  },
  reduced({ on }) {
    raw(41, [on ? 1 : 0]);
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
  // The knob's screen (the runtime ignores these in face-only mode).
  caption({ text }) {
    if (typeof text === "string") raw(42, [], text);
  },
  heard({ text }) {
    if (typeof text === "string") raw(43, [], text);
  },
  card({ title, speaker, room, timeSlot }) {
    if (typeof title === "string") raw(44, [], fields(title, speaker, room, timeSlot));
  },
  text({ body }) {
    if (typeof body === "string") raw(45, [], body);
  },
  qr({ url, caption }) {
    if (typeof url === "string") raw(46, [], fields(url, caption));
  },
  stats() {
    const average = cost.total / Math.max(1, cost.frames);
    const snapshot = JSON.parse(module.UTF8ToString(module._owy_snapshot()));
    postMessage({ type: "stats", frames: cost.frames, average, worst: cost.worst, snapshot });
  },
};

async function init({ canvas, size: px, board, fps = 60, lag: late = 0, device: twin = false }) {
  module = await createRuntime();
  device = twin === true;
  size = boot(module, (Math.random() * 0xfffffffe + 1) >>> 0, board, px, !device).size;
  // Awake from its first frame: past the boot's shut lids (wake_at 1.6 s) and their opening, unseen.
  module._owy_advance(2000);
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
