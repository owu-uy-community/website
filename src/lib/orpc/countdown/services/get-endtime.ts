import type { CountdownEndtime } from "../schemas";
import { getCountdownState } from "./get-state";

/**
 * Get countdown endtime (targetTime only)
 * This is a lightweight endpoint for clients that only need to know when the countdown ends
 */
export async function getCountdownEndtime(): Promise<CountdownEndtime> {
  const state = await getCountdownState();

  return {
    targetTime: state.targetTime ?? null,
  };
}

