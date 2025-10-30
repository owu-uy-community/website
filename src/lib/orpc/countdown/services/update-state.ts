import type { UpdateCountdownStateInput, CountdownState } from "../schemas";
import { getCountdownState, updateCachedState } from "./get-state";

export async function updateCountdownState(input: UpdateCountdownStateInput): Promise<CountdownState> {
  const currentState = await getCountdownState();
  let newState: CountdownState;

  switch (input.action) {
    case "start":
      // Calculate targetTime from current remainingSeconds or use provided targetTime
      const startTargetTime = input.targetTime 
        ? input.targetTime 
        : new Date(Date.now() + currentState.remainingSeconds * 1000).toISOString();
      
      newState = {
        ...currentState,
        isRunning: true,
        targetTime: startTargetTime,
        lastUpdated: new Date().toISOString(),
      };
      break;

    case "pause":
      // When pausing, calculate remaining seconds from targetTime and clear targetTime
      let remainingOnPause = currentState.remainingSeconds;
      if (currentState.targetTime) {
        remainingOnPause = Math.max(0, Math.floor((new Date(currentState.targetTime).getTime() - Date.now()) / 1000));
      }
      
      newState = {
        ...currentState,
        isRunning: false,
        remainingSeconds: remainingOnPause,
        targetTime: undefined, // Clear targetTime when paused
        lastUpdated: new Date().toISOString(),
      };
      break;

    case "reset":
      newState = {
        ...currentState,
        isRunning: false,
        remainingSeconds: 0,
        targetTime: undefined, // Clear targetTime on reset
        lastUpdated: new Date().toISOString(),
      };
      break;

    case "setDuration":
      if (!input.durationSeconds || input.durationSeconds <= 0) {
        throw new Error("durationSeconds must be positive");
      }
      
      newState = {
        ...currentState,
        isRunning: false,
        remainingSeconds: input.durationSeconds,
        totalSeconds: input.durationSeconds,
        targetTime: undefined, // Clear targetTime when setting duration (not started yet)
        lastUpdated: new Date().toISOString(),
      };
      break;

    case "toggleSound":
      newState = {
        ...currentState,
        soundEnabled: !currentState.soundEnabled,
        lastUpdated: new Date().toISOString(),
      };
      break;

    case "setTargetTime":
      if (!input.targetTime) {
        throw new Error("targetTime is required");
      }

      const targetDate = new Date(input.targetTime);
      const now = new Date();
      const secondsUntilTarget = Math.max(0, Math.floor((targetDate.getTime() - now.getTime()) / 1000));

      if (isNaN(secondsUntilTarget)) {
        throw new Error("Invalid target time");
      }

      newState = {
        ...currentState,
        isRunning: false,
        remainingSeconds: secondsUntilTarget,
        totalSeconds: secondsUntilTarget,
        targetTime: targetDate.toISOString(),
        lastUpdated: new Date().toISOString(),
      };
      break;

    default:
      throw new Error(`Unknown action: ${input.action}`);
  }

  updateCachedState(newState);
  return newState;
}
