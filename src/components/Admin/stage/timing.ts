import type { SceneId } from "lib/owy-stage/scenes";

type Params = Record<string, unknown>;
const seconds = (params: Params) => Number(params.seconds) || 0;
const minutes = (params: Params) => (Number(params.minutes) || 0) * 60;

/**
 * Scenes that run one clock from the moment they go on air, and how long it
 * is. Scenes whose `seconds` means something else — a notice's rotation, one
 * quiz-race question, a round of corners — are left out on purpose: a
 * countdown there would be wrong.
 */
const CLOCKS: Partial<Record<SceneId, (params: Params) => number>> = {
  launch: seconds,
  photo: seconds,
  quiz: seconds,
  trivia: seconds,
  guess: seconds,
  "pick-number": seconds,
  "tap-race": seconds,
  draw: seconds,
  talk: minutes,
  "talk-timer": minutes,
  "human-bingo": minutes,
};

/** Seconds the scene's own clock runs from the take, or null for scenes without one. */
export function sceneClock(scene: SceneId, params: Params): number | null {
  const clock = CLOCKS[scene];
  const total = clock ? clock(params) : 0;

  return total > 0 ? total : null;
}

/** `m:ss` (or `h:mm:ss` past the hour), for timers on the desk. */
export function clockText(totalSeconds: number) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");

  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
}
