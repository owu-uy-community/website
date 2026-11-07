/**
 * The OWU Unplugged scene's cut, taken frame by frame from the reference video (30 fps: 33 ms
 * is one frame). OWU's look holds, flickers into unplugged.owu.uy's pixel look with a few black
 * frames, and stays there, slipping back to OWU for a moment every so often.
 */
export type Look = "owu" | "pixel" | "off";
type Step = [look: Look, ms: number];

export const HOLD_MS = 4200;
const INTO: Step[] = [
  ["pixel", 67],
  ["owu", 133],
  ["off", 33],
  ["pixel", 167],
  ["owu", 67],
  ["pixel", 67],
  ["off", 100],
  ["owu", 167],
  ["pixel", 100],
  ["owu", 67],
  ["pixel", 267],
  ["off", 67],
  ["owu", 100],
  ["pixel", 100],
  ["owu", 67],
];
const SLIP: Step[] = [
  ["owu", 100],
  ["off", 33],
  ["pixel", 67],
  ["owu", 133],
];
export const SLIP_EVERY_MS = 15_000;

const length = (steps: Step[]) => steps.reduce((sum, [, ms]) => sum + ms, 0);
export const SETTLED_MS = HOLD_MS + length(INTO);
const SLIP_MS = length(SLIP);

function walk(steps: Step[], t: number): Look | undefined {
  for (const [look, ms] of steps) {
    if (t < ms) return look;
    t -= ms;
  }
}

/** What the wall shows `t` ms after the scene mounts; `noise` while the picture glitches. */
export function cueAt(t: number): { look: Look; noise: boolean } {
  if (t < HOLD_MS) return { look: "owu", noise: false };
  const into = walk(INTO, t - HOLD_MS);
  if (into) return { look: into, noise: true };
  // Each slip closes a window, so the first one comes a full window after settling
  const late = ((t - SETTLED_MS) % SLIP_EVERY_MS) - (SLIP_EVERY_MS - SLIP_MS);
  const slip = late >= 0 ? walk(SLIP, late) : undefined;

  return slip ? { look: slip, noise: true } : { look: "pixel", noise: false };
}
