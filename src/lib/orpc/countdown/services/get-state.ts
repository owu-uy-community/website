import type { CountdownState } from "../schemas";
import { prisma } from "../../../prisma";

const COUNTDOWN_CHANNEL = "countdown-state";
const DEFAULT_STATE: CountdownState = {
  isRunning: false,
  remainingSeconds: 0, // Default to 00:00
  totalSeconds: 0,
  lastUpdated: new Date().toISOString(),
  soundEnabled: false,
};

const COUNTDOWN_STATE_ID = "global";

type StoredCountdownState = {
  targetTime?: Date | string | null;
  remainingSeconds?: number;
  totalSeconds?: number;
  soundEnabled?: boolean;
  updatedAt?: Date | string;
};

function deriveCurrentState(input: StoredCountdownState | null | undefined): CountdownState {
  const nowIso = new Date().toISOString();

  const base: CountdownState = {
    ...DEFAULT_STATE,
    isRunning: false,
    remainingSeconds: input?.remainingSeconds ?? DEFAULT_STATE.remainingSeconds,
    totalSeconds: input?.totalSeconds ?? DEFAULT_STATE.totalSeconds,
    soundEnabled: input?.soundEnabled ?? DEFAULT_STATE.soundEnabled,
    lastUpdated: input?.updatedAt
      ? input.updatedAt instanceof Date
        ? input.updatedAt.toISOString()
        : input.updatedAt
      : nowIso,
    targetTime: input?.targetTime
      ? input.targetTime instanceof Date
        ? input.targetTime.toISOString()
        : input.targetTime
      : undefined,
  };

  if (input?.targetTime) {
    const targetTimestamp =
      input.targetTime instanceof Date ? input.targetTime.getTime() : new Date(input.targetTime).getTime();
    if (!Number.isNaN(targetTimestamp)) {
      const remaining = Math.max(0, Math.floor((targetTimestamp - Date.now()) / 1000));

      base.isRunning = remaining > 0;
      base.remainingSeconds = remaining;
      base.lastUpdated = new Date().toISOString();
      base.targetTime = base.isRunning
        ? input.targetTime instanceof Date
          ? input.targetTime.toISOString()
          : input.targetTime
        : undefined;

      if (remaining === 0) {
        base.remainingSeconds = 0;
        // Preserve totalSeconds when countdown expires so it can be restarted
        if (!base.totalSeconds && input.totalSeconds) {
          base.totalSeconds = input.totalSeconds;
        }
      }
    }
  } else {
    base.isRunning = false;
    if (typeof input?.remainingSeconds === "number") {
      base.remainingSeconds = Math.max(0, input.remainingSeconds);
    }
  }

  return {
    ...base,
    lastUpdated: base.lastUpdated ?? nowIso,
  };
}

async function loadCountdownStateFromStore(): Promise<CountdownState | null> {
  try {
    const persisted = await prisma.countdownState.findUnique({
      where: { id: COUNTDOWN_STATE_ID },
    });

    if (persisted) {
      const derived = deriveCurrentState(persisted);
      console.log("✅ [Countdown] Loaded persisted countdown state from database", {
        isRunning: derived.isRunning,
        targetTime: derived.targetTime,
        remainingSeconds: derived.remainingSeconds,
      });
      return derived;
    }

    console.log("ℹ️ [Countdown] No persisted countdown state found - using defaults");
    return null;
  } catch (error) {
    console.error("❌ [Countdown] Unexpected error loading countdown state:", error);
    return null;
  }
}

async function persistCountdownState(state: CountdownState) {
  try {
    await prisma.countdownState.upsert({
      where: { id: COUNTDOWN_STATE_ID },
      create: {
        id: COUNTDOWN_STATE_ID,
        targetTime: state.targetTime ? new Date(state.targetTime) : null,
        remainingSeconds: state.remainingSeconds,
        totalSeconds: state.totalSeconds,
        soundEnabled: state.soundEnabled,
      },
      update: {
        targetTime: state.targetTime ? new Date(state.targetTime) : null,
        remainingSeconds: state.remainingSeconds,
        totalSeconds: state.totalSeconds,
        soundEnabled: state.soundEnabled,
      },
    });
  } catch (error) {
    console.error("❌ [Countdown] Unexpected error persisting countdown state:", error);
  }
}

export async function getCountdownState(): Promise<CountdownState> {
  const persisted = await loadCountdownStateFromStore();
  const result = persisted ?? deriveCurrentState(DEFAULT_STATE);
  return result;
}

export async function saveCountdownState(state: CountdownState): Promise<CountdownState> {
  // When saving, we should persist the state as-is (not derive it)
  // Derivation only happens when loading from storage
  await persistCountdownState(state);
  return state;
}

export { COUNTDOWN_CHANNEL, DEFAULT_STATE };
