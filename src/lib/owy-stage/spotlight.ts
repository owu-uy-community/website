import type { Spotlight } from "./scenes";

/**
 * The spotlight's clock on «Owy y la grilla» (src/components/OwyStage/scenes/OwyFace.tsx), in
 * human time: the grid blurs and the sticky comes in, it holds long enough to read from across
 * the room, flies to its cell while the grid comes back, and the cell glows before the next one.
 * No React here, so the timing is testable.
 */

/** The grid going soft and the sticky landing in front of it. */
export const SPOT_IN_MS = 900;
/** The sticky travelling to its cell while the grid comes back into focus. */
export const SPOT_FLY_MS = 1100;
/** The cell glows with its new talk; the next spotlight waits for it. */
export const SPOT_SETTLE_MS = 1600;
/** A spotlight that waited longer than this in line is old news: skipped, not replayed. */
export const SPOT_STALE_MS = 25_000;

/**
 * How long a sticky holds: time for the eye to land, then about 15 characters a second of title
 * and name (an unhurried pace for a wall read across a room), within bounds.
 */
export function readMs(track: Pick<Spotlight["track"], "title" | "speaker">): number {
  const chars = track.title.trim().length + (track.speaker?.trim().length ?? 0);

  return Math.round(Math.min(11_000, Math.max(6_500, 3_500 + chars * 65)));
}

export type Queued = Spotlight & { at: number };

/**
 * A spotlight joins the line once: the same one heard twice (live and from the recent list) or a
 * talk already waiting doesn't repeat, and what waited too long leaves. The operator's pick goes
 * first.
 */
export function enqueue(queue: readonly Queued[], spot: Spotlight, now: number): Queued[] {
  const fresh = queue.filter((item) => now - item.at < SPOT_STALE_MS);
  if (fresh.some((item) => item.id === spot.id || item.track.id === spot.track.id)) return fresh;
  const item = { ...spot, at: now };

  return spot.how === "manual" ? [item, ...fresh] : [...fresh, item];
}

/** The next spotlight to show, and the line after it; stale ones are dropped on the way. */
export function nextUp(queue: readonly Queued[], now: number): { spot: Queued | null; rest: Queued[] } {
  const fresh = queue.filter((item) => now - item.at < SPOT_STALE_MS);

  return { spot: fresh[0] ?? null, rest: fresh.slice(1) };
}

/** A box inside another (both in stage pixels): where it goes and how much it shrinks, centred and uniform. */
export function flyTo(
  from: { x: number; y: number; w: number; h: number },
  to: { x: number; y: number; w: number; h: number }
): { x: number; y: number; scale: number } {
  const scale = Math.min(to.w / from.w, to.h / from.h);

  return {
    x: Math.round(to.x + to.w / 2 - (from.x + from.w / 2)),
    y: Math.round(to.y + to.h / 2 - (from.y + from.h / 2)),
    scale: Math.round(scale * 1000) / 1000,
  };
}

/** in: the sticky comes in over the blurring grid · hold: reading time · fly: back to its cell · land: the cell glows. */
export type Phase = "in" | "hold" | "fly" | "land";
const PHASES: readonly Phase[] = ["in", "hold", "fly", "land"];

export type Spotting = { queue: Queued[]; current: Queued | null; phase: Phase };
export const NO_SPOT: Spotting = { queue: [], current: null, phase: "in" };

export type SpotAction =
  | { type: "heard"; spot: Spotlight; now: number }
  /** The board is up and nothing is showing: the next in line, if any. */
  | { type: "next"; now: number }
  /** The current phase is over. */
  | { type: "step"; now: number }
  /** The board left the wall: what was showing stops (the line keeps, until it goes stale). */
  | { type: "drop" };

/** The line and what is on, as the wall plays them; the timers live in the scene (see phaseMs). */
export function spotting(state: Spotting, action: SpotAction): Spotting {
  switch (action.type) {
    case "heard":
      // The talk on screen right now doesn't line up behind itself.
      if (state.current?.track.id === action.spot.track.id) return state;
      return { ...state, queue: enqueue(state.queue, action.spot, action.now) };
    case "next": {
      if (state.current) return state;
      const { spot, rest } = nextUp(state.queue, action.now);
      return { queue: rest, current: spot, phase: "in" };
    }
    case "step": {
      if (!state.current) return state;
      const after = PHASES[PHASES.indexOf(state.phase) + 1];
      if (after) return { ...state, phase: after };
      const { spot, rest } = nextUp(state.queue, action.now);
      return { queue: rest, current: spot, phase: "in" };
    }
    case "drop":
      return state.current ? { ...state, current: null, phase: "in" } : state;
  }
}

export function phaseMs(phase: Phase, track: Spotlight["track"]): number {
  return phase === "in"
    ? SPOT_IN_MS
    : phase === "hold"
      ? readMs(track)
      : phase === "fly"
        ? SPOT_FLY_MS
        : SPOT_SETTLE_MS;
}

/**
 * Which rows of the day the grid shows (`size` of `total`): from the block that's on (`current`),
 * moved just enough to include the spotlight's (`target`), so the sticky always has a cell to fly to.
 */
export function rowWindow(total: number, size: number, current: number, target: number | null): number {
  const clamp = (from: number) => Math.max(0, Math.min(from, total - size));
  const from = clamp(current);
  if (target === null || target < 0 || (target >= from && target < from + size)) return from;

  return clamp(target < from ? target : target - size + 1);
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * A cell of a CSS grid laid out as `${head.w}px repeat(cols, minmax(0,1fr))` by
 * `${head.h}px repeat(rows, minmax(0,1fr))` with `gap`: where it is, in the grid's coordinates
 * (the sticky's flight is computed, not measured, so it lands the same on every screen).
 */
export function cellBox(
  grid: Box,
  head: { w: number; h: number },
  gap: number,
  size: { cols: number; rows: number },
  at: { col: number; row: number }
): Box {
  const w = (grid.w - head.w - size.cols * gap) / size.cols;
  const h = (grid.h - head.h - size.rows * gap) / size.rows;

  return { x: grid.x + head.w + gap + at.col * (w + gap), y: grid.y + head.h + gap + at.row * (h + gap), w, h };
}
