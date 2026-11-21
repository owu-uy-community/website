/**
 * The stage's logical canvas. 1920×1080 everywhere by default; a wall with
 * another shape — UCU's 3584×960 strip (56:15) — passes its own so the frame
 * fills the screen instead of letterboxing. No React here: the stage pages are
 * server components and parse the query string before rendering the client.
 */
export type StageCanvas = { w: number; h: number };

export const STAGE_W = 1920;
export const STAGE_H = 1080;
export const DEFAULT_CANVAS: StageCanvas = { w: STAGE_W, h: STAGE_H };

/** Named walls, so nobody has to remember a resolution on the day. */
export const CANVAS_PRESETS: Record<string, StageCanvas> = {
  ucu: { w: 3584, h: 960 },
  wall: { w: 3584, h: 960 },
};

/** `3584x960`, a preset name, or `fit` (take the shape from the screen). */
export function parseCanvas(value: string | undefined): StageCanvas | "fit" {
  if (!value) return DEFAULT_CANVAS;
  if (value === "fit") return "fit";
  const preset = CANVAS_PRESETS[value.toLowerCase()];
  if (preset) return preset;
  const match = value.match(/^(\d{3,5})x(\d{3,5})$/i);
  if (!match) return DEFAULT_CANVAS;

  return { w: Number(match[1]), h: Number(match[2]) };
}
