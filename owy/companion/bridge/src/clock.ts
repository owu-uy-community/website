/** Injectable time for deterministic transport tests and the browser fixture HAL.
 * Production always uses the standard timers below. No global timer monkeypatch. */
export type ClockTimer = ReturnType<typeof setTimeout>;
export interface RuntimeClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): ClockTimer;
  clearTimeout(timer: ClockTimer): void;
  setInterval(callback: () => void, ms: number): ClockTimer;
  clearInterval(timer: ClockTimer): void;
}
export const systemClock: RuntimeClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: timer => clearTimeout(timer),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: timer => clearInterval(timer),
};
