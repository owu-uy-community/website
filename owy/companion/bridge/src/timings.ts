/**
 * The bridge's turn timings in one place, and the only sleep/timeout helpers.
 * test/timings.test.ts checks them against the board's own watchdog
 * (firmware/packages/voice.yaml `turn_watchdog`): a budget the board does not
 * grant ends in the board cancelling the run while the bridge is still working.
 */

/**
 * The board's watchdog, from the run's start (the mic opening) to the end of Owy's
 * audio: a conversation turn, and a pitch run (recording, thinking, Owy's reply).
 */
export const FIRMWARE_WATCHDOG_MS = { turn: 90_000, pitch: 240_000 } as const;

/** What Owy's spoken reply at the end of a run takes at most (an answer, an announcement). */
export const REPLY_MARGIN_MS = 15_000;

export const TIMINGS = {
  /** A connect already under way gets this long before a physical tap is answered through the cascade instead. */
  acceptWaitMs: 1_500,
  /** With no board up nothing keeps the voice warm: a console line waits this long for a cold connect. */
  ownConnectWaitMs: 4_000,
  /** Transcribe + eve/text model + first TTS audio, with room for a slow network. */
  cascadeThinkingMs: 45_000,
  /** The gateway caps a realtime session at 25 min; renew it between turns well before. */
  rotateAfterMs: 20 * 60_000,
  keepWarmEveryMs: 30_000,
  /** A voice turn's own recorder: a pause this long ends the utterance (the realtime model has its own VAD). */
  turn: { silenceMs: 900, maxMs: 30_000, minSpeechMs: 300 },
  /** A pitch run gives the person this long to start talking. */
  pitchNoSpeechMs: 15_000,
  /** createPlaced and the board read get this long before the bridge looks for itself. */
  placeTimeoutMs: 20_000,
  /** Caption and transcript updates on a 360 px page: one per this many ms is plenty. */
  captionEveryMs: 300,
} as const;

/** How long a pitch may think: what the watchdog leaves after the longest recording and Owy's reply. */
export function pitchThinkingMs(maxRecordingS: number): number {
  return Math.min(90_000, FIRMWARE_WATCHDOG_MS.pitch - maxRecordingS * 1000 - REPLY_MARGIN_MS);
}

/** Resolves after `ms`, or rejects as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

/** Rejects after `ms`; the slow promise's late outcome is ignored (Promise.race keeps it handled). */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = `sin respuesta en ${ms / 1000} s`): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** A promise's outcome within `ms`, without abandoning it: `late` means it is still running. */
export function within<T>(promise: Promise<T>, ms: number): Promise<{ value: T } | { error: unknown } | { late: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    ),
    new Promise<{ late: true }>((resolve) => {
      timer = setTimeout(() => resolve({ late: true }), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
