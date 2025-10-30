import { createClient } from "@supabase/supabase-js";
import type { CountdownState } from "../schemas";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const COUNTDOWN_CHANNEL = "countdown-state";
const DEFAULT_STATE: CountdownState = {
  isRunning: false,
  remainingSeconds: 0, // Default to 00:00
  totalSeconds: 0,
  lastUpdated: new Date().toISOString(),
  soundEnabled: false,
};

// In-memory cache for the countdown state
let cachedState: CountdownState = DEFAULT_STATE;

export async function getCountdownState(): Promise<CountdownState> {
  return cachedState;
}

export function updateCachedState(state: Partial<CountdownState>) {
  cachedState = {
    ...cachedState,
    ...state,
    lastUpdated: new Date().toISOString(),
  };
}

export { COUNTDOWN_CHANNEL, DEFAULT_STATE };
