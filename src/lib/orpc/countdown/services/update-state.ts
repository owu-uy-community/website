import type { UpdateCountdownStateInput, CountdownState } from "../schemas";
import { getCountdownState, saveCountdownState } from "./get-state";

export async function updateCountdownState(input: UpdateCountdownStateInput): Promise<CountdownState> {
  const currentState = await getCountdownState();
  console.log("⚙️ [Countdown] updateCountdownState - action:", input.action, "currentState:", {
    isRunning: currentState.isRunning,
    remainingSeconds: currentState.remainingSeconds,
    totalSeconds: currentState.totalSeconds,
    targetTime: currentState.targetTime,
  });
  let newState: CountdownState;

  switch (input.action) {
    case "start":
      // Calculate targetTime from current remainingSeconds or use provided targetTime
      // If remainingSeconds is 0 but totalSeconds exists, use totalSeconds (for restarting expired countdown)
      const secondsToUse =
        currentState.remainingSeconds > 0
          ? currentState.remainingSeconds
          : currentState.totalSeconds > 0
            ? currentState.totalSeconds
            : 0;

      console.log("▶️ [Countdown] Start - secondsToUse:", secondsToUse);

      const startTargetTime = input.targetTime
        ? input.targetTime
        : new Date(Date.now() + secondsToUse * 1000).toISOString();

      newState = {
        ...currentState,
        isRunning: true,
        targetTime: startTargetTime,
        remainingSeconds: secondsToUse,
        totalSeconds: currentState.totalSeconds || secondsToUse,
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

  const persistedState = await saveCountdownState(newState);

  // Broadcast state CHANGE
  // Clients calculate independently from targetTime
  await broadcastStateChange(persistedState);

  return persistedState;
}

/**
 * Broadcast state change to all clients
 * Called ONLY when admin changes state (not every second!)
 */
async function broadcastStateChange(state: CountdownState) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const channel = supabase.channel("countdown-state");

    await channel.send({
      type: "broadcast",
      event: "countdown_state_change", // Changed event name
      payload: state,
    });

    console.log("📡 [Countdown] State change broadcasted:", {
      isRunning: state.isRunning,
      targetTime: state.targetTime,
      remainingSeconds: state.remainingSeconds,
    });
  } catch (error) {
    console.error("❌ [Countdown] Failed to broadcast state change:", error);
  }
}
