/**
 * The ops page's few rules, as plain functions: what the big button does in each phase, which
 * card a pitch just placed, and the countdown's clock. OwyOps.tsx only renders what these return.
 */
import type { FaceState } from "lib/owy-stage/scenes";

import type { CompanionCommand, DeviceStatus } from "../../../../owy/companion/bridge/src/web/contract";

export type Phase = DeviceStatus["phase"];

/** Minutes the countdown buttons offer: a pitch round, a break, a block. */
export const COUNTDOWN_PRESETS = [5, 10, 15, 45] as const;

/** The phase a face event implies; faces outside a turn (happy, error, offline) mean no turn. */
export function phaseOfFace(face: FaceState): Phase {
  return face === "listening" || face === "thinking" || face === "speaking" ? face : "idle";
}

/**
 * The virtual knob's one big button, like the knob's tap: idle → Owy listens; listening → that
 * was all (a pitch is sent); thinking or speaking → Owy stops. `pitch`: a pitch is what is being
 * recorded (the mode, or the Pitch button).
 */
export function knobAction(
  deviceId: string,
  phase: Phase,
  pitch: boolean
): { label: string; hint: string; command: CompanionCommand } {
  if (phase === "listening")
    return pitch
      ? {
          label: "Enviar",
          hint: "cierra el pitch y arma la tarjeta",
          command: { type: "pitch", deviceId, action: "submit" },
        }
      : { label: "Listo", hint: "ya terminé de hablar", command: { type: "tap", deviceId } };
  if (phase === "thinking" || phase === "speaking")
    return { label: "Frenar", hint: "Owy se calla", command: { type: "hush", deviceId } };
  return {
    label: "Tocar",
    hint: pitch ? "graba un pitch" : "Owy escucha",
    command: { type: "tap", deviceId },
  };
}

/** The newest card on the board (the one a pitch just placed); null on an empty board. */
export function latestNote<T extends { createdAt: string }>(notes: readonly T[]): T | null {
  let latest: T | null = null;
  for (const note of notes) if (!latest || Date.parse(note.createdAt) > Date.parse(latest.createdAt)) latest = note;
  return latest;
}

/** Seconds left at `now`: ticking from the target while it runs, the stored rest otherwise. */
export function countdownLeft(
  state: { isRunning: boolean; remainingSeconds: number; targetTime?: string | null },
  now: number
): number {
  if (state.isRunning && state.targetTime) return Math.max(0, Math.round((Date.parse(state.targetTime) - now) / 1000));
  return Math.max(0, state.remainingSeconds);
}

/** «12:05», «1:02:30» past the hour. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}
