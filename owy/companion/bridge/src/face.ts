import type { TurnPhase } from "./device/pipeline";
import type { FaceState } from "./realtime/tools";

/** Maps a voice-turn phase to the face the device should show. */
export function faceForPhase(phase: TurnPhase): FaceState {
  switch (phase) {
    case "listening":
      return "listening";
    case "thinking":
      return "thinking";
    case "speaking":
      return "speaking";
    case "created":
    case "finished":
    default:
      return "idle";
  }
}
