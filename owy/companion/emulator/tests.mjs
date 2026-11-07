// The checked-in face runtime: its provenance, a smoke run of the face it draws, the knob's twin
// (device mode) and the worker's protocol.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import createRuntime from "../../../public/companion-runtime/owy-runtime.mjs";
import { boot } from "./session.mjs";
import { verifyArtifacts } from "./provenance.mjs";

/** A runtime's test handles: typed inputs, its snapshot, and a digest of the panel (or a region of it). */
function handles(module, size) {
  return {
    module,
    input(kind, values = [], text = "") {
      const bytes = new TextEncoder().encode(text);
      const ptr = module._malloc(bytes.length + 1);
      module.HEAPU8.set(bytes, ptr);
      module.HEAPU8[ptr + bytes.length] = 0;
      const v = [...values, 0, 0, 0, 0, 0, 0].slice(0, 6);
      module._owy_input(kind, ...v, ptr);
      module._free(ptr);
    },
    snapshot: () => JSON.parse(module.UTF8ToString(module._owy_snapshot())),
    digest(x = 0, y = 0, w = size, h = size) {
      const at = module._owy_pixels() / 2,
        hash = createHash("sha256");
      for (let row = y; row < y + h; row++) {
        const from = at + row * size + x;
        hash.update(module.HEAPU16.slice(from, from + w));
      }
      return hash.digest("hex");
    },
  };
}

const module = await createRuntime();
const size = boot(module, 0x4f5759, "knob", 360).size;
const { input, snapshot, digest } = handles(module, size);

/** The knob's twin, freshly booted and awake (what face.mjs does with `device: true`). */
const twin = await createRuntime();
function knob() {
  boot(twin, 0x4f5759, "knob", undefined, false);
  twin._owy_advance(2000);
  return handles(twin, 360);
}
const SEP = "\x1f";

test("checked-in browser assets match the firmware and the emulator sources", () => {
  verifyArtifacts();
});

test("the face boots awake, follows the bridge's phases and the knob's moods, and paints each change", () => {
  module._owy_advance(2000);
  assert.equal(size, 360);
  const idle = digest();
  assert.equal(snapshot().mood, 0);
  input(33, [2, 0.6, 0]); // listening with a live mic level
  module._owy_advance(500);
  assert.equal(snapshot().phase, 2);
  const listening = digest();
  assert.notEqual(listening, idle, "listening paints the halo and widens the eyes");
  input(33, [3, 0, 0]); // thinking: the nod
  module._owy_advance(600);
  assert.notEqual(digest(), listening);
  input(33, [4, 0, 80]); // speaking, level-only lips
  module._owy_advance(400);
  const speaking = digest();
  input(39, [0], "____"); // a mouth track: wide open frames
  module._owy_advance(200);
  assert.notEqual(digest(), speaking, "the mouth track moves the lips");
  input(37, [1, 0, 100]); // happy while talking
  module._owy_advance(300);
  input(33, [0, 0, 0]); // the turn ends
  input(18, [4]); // happy for a moment
  module._owy_advance(300);
  assert.equal(snapshot().mood, 4);
  input(18, [6]); // offline: grey, searching
  module._owy_advance(300);
  assert.equal(snapshot().mood, 6);
  assert.notEqual(digest(), idle);
  input(18, [-1]);
  module._owy_advance(300);
  assert.equal(snapshot().mood, 0);
});

test("the dirty rectangle reports what was flushed and then clears", () => {
  module._owy_dirty();
  input(21); // a pet: cheeks and a bounce
  module._owy_advance(100);
  const d = module._owy_dirty() >> 2;
  const [x, y, w, h] = module.HEAP32.subarray(d, d + 4);
  assert(w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= size && y + h <= size);
  const again = module._owy_dirty() >> 2;
  assert.equal(module.HEAP32.subarray(again, again + 4)[2], 0);
});

test("the wall takes pausa and reduced motion, and never the knob's pages", () => {
  input(40, [1]); // pausa: the privacy face over listening
  input(33, [2, 0.8, 0]);
  module._owy_advance(300);
  assert.equal(snapshot().mood, 7);
  input(40, [0]);
  module._owy_advance(100);
  assert.equal(snapshot().mood, 1);
  input(33, [0, 0, 0]);
  input(41, [1]); // reduced motion: no saccades, breathing or blinks
  module._owy_advance(1000);
  const still = digest();
  module._owy_advance(4000);
  assert.equal(digest(), still);
  input(41, [0]);
  input(42, [], "Hola"); // a caption: face-only ignores it
  assert.equal(snapshot().page, "face");
});

test("device: a caption holds the answer view through the conversation; the face is back 12 s after it ends", () => {
  const { input, snapshot, module } = knob();
  assert.equal(snapshot().page, "face");
  input(33, [2, 0, 0]); // listening
  input(33, [3, 0, 0]); // thinking
  module._owy_advance(500);
  assert.equal(snapshot().page, "face", "listening and thinking happen on the face");
  input(42, [], "Hola, soy Owy.");
  assert.equal(snapshot().page, "convo");
  input(33, [4, 0, 0]); // speaking
  input(42, [], "Hola, soy Owy. ¿En qué te ayudo?");
  input(33, [2, 0, 0]); // the follow-up mic: still the answer view
  input(33, [3, 0, 0]);
  input(33, [4, 0, 0]);
  module._owy_advance(1000);
  assert.equal(snapshot().page, "convo");
  input(18, [0]); // idle: the conversation ends
  input(33, [0, 0, 0]);
  module._owy_advance(11990);
  assert.equal(snapshot().page, "convo", "the last reply stays readable");
  module._owy_advance(20);
  assert.equal(snapshot().page, "face");
});

test("device: the heard pill shows what Owy understood, and a new conversation starts it at «escuchando…»", () => {
  const { input, snapshot, digest, module } = knob();
  // The pill only: under the mini face, above the reply, inside the rim.
  const pill = () => digest(40, 110, 280, 40);
  input(42, [], "Hola."); // the answer view, held
  module._owy_advance(100);
  const empty = pill();
  input(43, [], "¿qué charla sigue?");
  module._owy_advance(100);
  const heard = pill();
  assert.notEqual(heard, empty);
  input(43, [], ""); // empty clears it
  module._owy_advance(100);
  assert.equal(pill(), empty);
  input(33, [2, 0, 0]); // a conversation starts: the held page stays, the pill says it is listening
  module._owy_advance(100);
  assert.equal(snapshot().page, "convo");
  const listening = pill();
  assert.notEqual(listening, empty);
  assert.notEqual(listening, heard);
  input(43, [], "¿qué charla sigue?"); // the transcript replaces it
  module._owy_advance(100);
  assert.equal(pill(), heard);
});

test("device: a card, a text and a QR each show, then return to the face after 12 s", () => {
  const { input, snapshot, digest, module } = knob();
  const pages = [
    [44, ["Rust para todos", "Ana", "Sala Azul", "15:00"].join(SEP), "card"],
    [45, "¡Gracias por venir!", "text"],
    [46, ["https://owu.uy/conf", ""].join(SEP), "qr"],
  ];
  for (const [kind, text, page] of pages) {
    input(kind, [], text);
    assert.equal(snapshot().page, page);
    module._owy_advance(11990);
    assert.equal(snapshot().page, page);
    module._owy_advance(20);
    assert.equal(snapshot().page, "face");
  }
  // The card's fields land where the firmware puts them: another speaker, another card.
  input(44, [], ["Rust para todos", "Ana", "Sala Azul", "15:00"].join(SEP));
  module._owy_advance(100);
  const ana = digest();
  input(44, [], ["Rust para todos", "Bruno", "Sala Azul", "15:00"].join(SEP));
  module._owy_advance(100);
  assert.notEqual(digest(), ana);
  // A turn brings the face back at once; a caption then keeps a pitch's card on screen.
  input(33, [2, 0, 0]);
  assert.equal(snapshot().page, "face");
  input(44, [], ["Rust para todos", "Ana", "Sala Azul", "15:00"].join(SEP));
  input(42, [], "¡Listo! Quedó en la grilla.");
  module._owy_advance(13000);
  assert.equal(snapshot().page, "card");
});

test("device: pausa puts Owy's privacy face over everything, with its hint and badge", () => {
  const { input, snapshot, digest, module } = knob();
  input(33, [2, 0, 0]); // listening
  module._owy_advance(300);
  const listening = digest();
  input(40, [1]);
  module._owy_advance(300);
  assert.equal(snapshot().mood, 7);
  assert.notEqual(digest(), listening);
  input(33, [0, 0, 0]); // still pausa whatever the bridge says
  module._owy_advance(300);
  assert.equal(snapshot().mood, 7);
  const pausa = digest();
  input(40, [0]);
  module._owy_advance(300);
  assert.equal(snapshot().mood, 0);
  assert.notEqual(digest(), pausa, "the badge and the pausa hint go");
});

test("device: strings are bounded without splitting a character; a long reply keeps its end", () => {
  const shown = (kind, text) => {
    const { input, digest, module } = knob();
    input(42, [], "·"); // the answer view
    input(kind, [], text);
    module._owy_advance(100);
    return digest();
  };
  // A reply past 8 KiB shows its last 8 KiB, from a whole character (the cut lands mid-«ñ»).
  const reply = shown(42, "ñ".repeat(4095) + "a");
  assert.equal(shown(42, "ñ".repeat(5000) + "a"), reply);
  assert.notEqual(shown(42, "ñ".repeat(4094) + "a"), reply);
  // What Owy heard, past 1 KiB, keeps its first 1 KiB, to a whole character.
  assert.equal(shown(43, "a" + "ñ".repeat(600)), shown(43, "a" + "ñ".repeat(511)));
});

/** face.mjs in a thread, with what a browser worker has: self, postMessage, ImageData and a canvas. */
function faceWorker() {
  const face = new URL("../../../public/companion-runtime/face.mjs", import.meta.url).href;
  const thread = new Worker(
    `const { parentPort } = require("node:worker_threads");
     globalThis.self = globalThis;
     globalThis.postMessage = (message) => parentPort.postMessage(message);
     globalThis.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
     const canvas = { getContext: () => ({ putImageData() {} }) };
     import(${JSON.stringify(face)}).then(() => {
       parentPort.on("message", (data) => self.onmessage({ data: data.type === "init" ? { ...data, canvas } : data }));
       parentPort.postMessage({ type: "loaded" });
     });`,
    { eval: true }
  );
  const reply = (type) =>
    new Promise((resolve) =>
      thread.on("message", function on(message) {
        if (message.type !== type) return;
        thread.off("message", on);
        resolve(message);
      })
    );
  const post = (message) => thread.postMessage(message);
  const snapshot = async () => {
    post({ type: "stats" });
    return (await reply("stats")).snapshot;
  };
  return { thread, reply, post, snapshot };
}

test("the worker follows the mic only while Owy listens, and drops a level that stops coming", async () => {
  const face = faceWorker();
  try {
    await face.reply("loaded");
    face.post({ type: "init", device: true });
    await face.reply("frame");
    face.post({ type: "state", state: "thinking" });
    face.post({ type: "level", level: 90 }); // not listening: nothing to follow
    let s = await face.snapshot();
    assert.deepEqual([s.phase, s.envelope[0]], [3, 0]);
    face.post({ type: "state", state: "listening" });
    face.post({ type: "level", level: 80 });
    s = await face.snapshot();
    assert.deepEqual([s.phase, s.envelope[0]], [2, 0.8]);
    await new Promise((resolve) => setTimeout(resolve, 600)); // no level for 300 ms: back to 0, still listening
    s = await face.snapshot();
    assert.deepEqual([s.phase, s.envelope[0]], [2, 0]);
    face.post({ type: "state", state: "speaking" });
    face.post({ type: "level", level: 70 });
    s = await face.snapshot();
    assert.deepEqual([s.phase, s.envelope[0]], [4, 0]);
    face.post({ type: "privacy", on: true });
    assert.equal((await face.snapshot()).mood, 7);
    face.post({ type: "caption", text: "Hola" });
    assert.equal((await face.snapshot()).page, "convo");
    face.post({ type: "card", title: "Rust para todos", speaker: null, room: "Sala\x1fAzul", timeSlot: 15 });
    assert.equal((await face.snapshot()).page, "card");
  } finally {
    await face.thread.terminate();
  }
});
