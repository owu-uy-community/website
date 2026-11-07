// The face runtime's few helpers, shared by face.mjs (the worker) and the tests.
/** Each board's panel: [px, face scale, rim radius, rim dot] (firmware substitutions, OWY_FACE_SCALE). */
export const BOARDS = { knob: [360, 0.7725, 166, 12], amoled: [466, 1, 214, 12] };
/** A board's face drawn at `size` px: its own geometry scaled, so the native size is the device's pixels. */
export function geometry(board = "knob", size) {
  const [screen, scale, ring, dot] = BOARDS[board] ?? BOARDS.knob;
  const px = Math.max(64, Math.min(1080, Math.round(size ?? screen)));
  const k = px / screen;
  return { size: px, scale: scale * k, ring: Math.round(ring * k), dot: Math.max(2, Math.round(dot * k)) };
}
/** owy_init for a board at a size (the runtime is face-only; the last flag is kept for the ABI). */
export function boot(module, seed, board, size, faceOnly = true) {
  const g = geometry(board, size);
  module._owy_init(seed, g.size, g.scale, g.ring, g.dot, faceOnly ? 1 : 0);
  return g;
}
/** Bridge mouth_track frames: base64url, one char per 40 ms. */
export const MOUTH_FRAMES = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * Paints what LVGL flushed since the last call into a 2D context, straight from
 * WASM memory (no copy). `full` repaints everything (a new canvas).
 */
export function paint(module, ctx, size, cache, full = false) {
  const ptr = module._owy_rgba();
  if (cache.ptr !== ptr || cache.image?.data.buffer !== module.HEAPU8.buffer) {
    cache.ptr = ptr;
    cache.image = new ImageData(new Uint8ClampedArray(module.HEAPU8.buffer, ptr, size * size * 4), size, size);
  }
  const d = module._owy_dirty() >> 2;
  const [x, y, w, h] = module.HEAP32.subarray(d, d + 4);
  if (full) ctx.putImageData(cache.image, 0, 0);
  else if (w > 0) ctx.putImageData(cache.image, 0, 0, x, y, w, h);
}
