// The checked-in face runtime: its provenance, and a smoke run of the face it draws.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import createRuntime from "../../../public/companion-runtime/owy-runtime.mjs";
import { boot } from "./session.mjs";
import { verifyArtifacts } from "./provenance.mjs";

const module = await createRuntime();
const size = boot(module, 0x4f5759, "knob", 360).size;
const digest = () => {
  const at = module._owy_pixels() / 2;
  return createHash("sha256").update(module.HEAPU16.slice(at, at + size * size)).digest("hex");
};
const input = (kind, values = [], text = "") => {
  const bytes = new TextEncoder().encode(text);
  const ptr = module._malloc(bytes.length + 1);
  module.HEAPU8.set(bytes, ptr);
  module.HEAPU8[ptr + bytes.length] = 0;
  const v = [...values, 0, 0, 0, 0, 0, 0].slice(0, 6);
  module._owy_input(kind, ...v, ptr);
  module._free(ptr);
};
const snapshot = () => JSON.parse(module.UTF8ToString(module._owy_snapshot()));

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
