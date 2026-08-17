import { eq } from "drizzle-orm";
import type { CountdownState } from "../schemas";
import { db } from "../../../db";
import { eventLiveState } from "../../../db/schema";

const DEFAULT_STATE: CountdownState = {
  isRunning: false,
  remainingSeconds: 0, // Default to 00:00
  totalSeconds: 0,
  lastUpdated: new Date().toISOString(),
  soundEnabled: false,
};

// TODO(multi-tenant): becomes a required eventId input once the frontend threads event ids.
export const LEGACY_EVENT_ID = "default-openspace";

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

async function loadCountdownStateFromStore(eventId: string): Promise<CountdownState | null> {
  const [persisted] = await db.select().from(eventLiveState).where(eq(eventLiveState.eventId, eventId)).limit(1);

  if (!persisted) return null;

  return deriveCurrentState({
    targetTime: persisted.countdownTargetTime,
    remainingSeconds: persisted.countdownRemainingSeconds,
    totalSeconds: persisted.countdownTotalSeconds,
    soundEnabled: persisted.countdownSoundEnabled,
    updatedAt: persisted.updatedAt,
  });
}

async function persistCountdownState(eventId: string, state: CountdownState) {
  const values = {
    countdownTargetTime: state.targetTime ? new Date(state.targetTime) : null,
    countdownRemainingSeconds: state.remainingSeconds,
    countdownTotalSeconds: state.totalSeconds,
    countdownSoundEnabled: state.soundEnabled,
  };

  await db
    .insert(eventLiveState)
    .values({ eventId, ...values })
    .onConflictDoUpdate({ target: eventLiveState.eventId, set: values });
}

export async function getCountdownState(eventId: string = LEGACY_EVENT_ID): Promise<CountdownState> {
  const persisted = await loadCountdownStateFromStore(eventId);

  return persisted ?? deriveCurrentState(DEFAULT_STATE);
}

export async function saveCountdownState(
  state: CountdownState,
  eventId: string = LEGACY_EVENT_ID
): Promise<CountdownState> {
  // When saving, we should persist the state as-is (not derive it)
  // Derivation only happens when loading from storage
  await persistCountdownState(eventId, state);

  return state;
}

export { DEFAULT_STATE };
