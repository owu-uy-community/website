import { useEffect, useRef } from "react";

import type { CountdownState } from "../lib/orpc/countdown/schemas";

type Tick = Pick<CountdownState, "isRunning" | "remainingSeconds" | "lastUpdated">;

/**
 * The countdown ran out by itself: it was running and is now at zero with no admin action in
 * between (an action, like a reset, arrives as a new state with a new `lastUpdated`).
 */
export const ranOut = (before: Tick, now: Tick) =>
  before.isRunning && !now.isRunning && now.remainingSeconds === 0 && before.lastUpdated === now.lastUpdated;

/**
 * Plays a sound once when the countdown runs out. Opening a screen on a finished countdown, or
 * resetting a running one, stays silent.
 */
export function useCountdownAudio(state: Tick & { soundEnabled: boolean }, soundPath = "/sounds/developers.mp3") {
  const before = useRef<Tick>(state);
  const { isRunning, remainingSeconds, lastUpdated, soundEnabled } = state;

  useEffect(() => {
    const now = { isRunning, remainingSeconds, lastUpdated };
    if (soundEnabled && ranOut(before.current, now)) {
      new Audio(soundPath).play().catch((error) => console.error("Failed to play countdown sound:", error));
    }
    before.current = now;
  }, [isRunning, remainingSeconds, lastUpdated, soundEnabled, soundPath]);
}
