import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { eventLiveState, events } from "../../db/schema";
import { eventChannel } from "../../realtime/channels";
import { query, transaction } from "../db";
import { NotFound } from "../errors";
import { Realtime } from "../services";
import type { CountdownState, UpdateCountdownStateInput } from "./schemas";

type Stored = {
  countdownTargetTime: Date | null;
  countdownRemainingSeconds: number;
  countdownTotalSeconds: number;
  countdownSoundEnabled: boolean;
  updatedAt: Date;
};

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

const secondsUntil = (target: Date, now: Date) => Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));

/**
 * What a screen should show at `now`. "Running" is not stored: a countdown runs
 * while its target time is ahead, so every screen agrees without a ticker.
 */
const toState = (stored: Stored | null, now: Date): CountdownState => {
  if (!stored) {
    return {
      isRunning: false,
      remainingSeconds: 0,
      totalSeconds: 0,
      soundEnabled: false,
      lastUpdated: now.toISOString(),
    };
  }
  const target = stored.countdownTargetTime;
  const remainingSeconds = target ? secondsUntil(target, now) : stored.countdownRemainingSeconds;
  const isRunning = target !== null && remainingSeconds > 0;

  return {
    isRunning,
    remainingSeconds,
    totalSeconds: stored.countdownTotalSeconds,
    soundEnabled: stored.countdownSoundEnabled,
    lastUpdated: (target ? now : stored.updatedAt).toISOString(),
    targetTime: isRunning ? target.toISOString() : undefined,
  };
};

/** The countdown after an admin action, as the columns that change. */
const apply = (input: UpdateCountdownStateInput, stored: Stored, now: Date): Partial<Stored> => {
  switch (input.action) {
    case "start": {
      const remaining = toState(stored, now).remainingSeconds;
      // A finished countdown starts over from its full length.
      const seconds = remaining > 0 ? remaining : stored.countdownTotalSeconds;
      const target = input.targetTime ? new Date(input.targetTime) : new Date(now.getTime() + seconds * 1000);

      return {
        countdownTargetTime: target,
        countdownRemainingSeconds: seconds,
        countdownTotalSeconds: stored.countdownTotalSeconds || seconds,
      };
    }
    case "pause":
      return { countdownTargetTime: null, countdownRemainingSeconds: toState(stored, now).remainingSeconds };
    case "reset":
      return { countdownTargetTime: null, countdownRemainingSeconds: 0 };
    case "toggleSound":
      return { countdownSoundEnabled: !stored.countdownSoundEnabled };
    case "setDuration":
      return {
        countdownTargetTime: null,
        countdownRemainingSeconds: input.durationSeconds,
        countdownTotalSeconds: input.durationSeconds,
      };
    case "setTargetTime": {
      const target = new Date(input.targetTime);
      const seconds = secondsUntil(target, now);

      return { countdownTargetTime: target, countdownRemainingSeconds: seconds, countdownTotalSeconds: seconds };
    }
  }
};

export const getCountdown = (eventId: string) =>
  query((db) =>
    db
      .select({ id: events.id, stored: eventLiveState })
      .from(events)
      .leftJoin(eventLiveState, eq(eventLiveState.eventId, events.id))
      .where(eq(events.id, eventId))
  ).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(toState(row.stored, new Date())) : Effect.fail(eventNotFound)))
  );

/**
 * Apply an admin action. The event's live-state row is locked while the
 * action reads and writes it, so two actions at once (start and toggle sound)
 * both land instead of one undoing the other.
 */
export const updateCountdown = (input: UpdateCountdownStateInput) =>
  Effect.gen(function* () {
    const state = yield* transaction(
      Effect.gen(function* () {
        yield* query((db) => db.insert(eventLiveState).values({ eventId: input.eventId }).onConflictDoNothing()).pipe(
          Effect.catchTag("ForeignKeyViolation", () => Effect.fail(eventNotFound))
        );
        const [stored] = yield* query((db) =>
          db.select().from(eventLiveState).where(eq(eventLiveState.eventId, input.eventId)).for("update")
        );
        const now = new Date();
        const [updated] = yield* query((db) =>
          db
            .update(eventLiveState)
            .set(apply(input, stored, now))
            .where(eq(eventLiveState.eventId, input.eventId))
            .returning()
        );

        return toState(updated, now);
      })
    );

    // Screens only hear about changes; between them they tick from targetTime.
    const realtime = yield* Realtime;
    yield* realtime.publish(eventChannel(input.eventId, "countdown"), "countdown_state_change", state);

    return state;
  });
