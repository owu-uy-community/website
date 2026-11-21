/**
 * The bridge's turn timings in one place, and the only sleep/timeout helpers.
 * The bridge owns every budget: the knob runs no pipeline and has no watchdog.
 */

export const TIMINGS = {
  /** A connect already under way gets this long before a physical tap is answered through the cascade instead. */
  acceptWaitMs: 1_500,
  /** With no board up nothing keeps the voice warm: a console line waits this long for a cold connect. */
  ownConnectWaitMs: 4_000,
  /** start() gives the board this long to answer; a dark one keeps connecting in the background. */
  boardWaitMs: 1_000,
  /** Transcribe + eve/text model + first TTS audio, with room for a slow network. */
  cascadeThinkingMs: 45_000,
  /** A pitch: extract (20 s), a duplicate check (4 s), a slow board write (20 s), and then some. */
  pitchThinkingMs: 90_000,
  /** The gateway caps a realtime session at 25 min; renew it between turns well before. */
  rotateAfterMs: 20 * 60_000,
  keepWarmEveryMs: 30_000,
  /** A voice turn's own recorder: a pause this long ends the utterance (the realtime model has its own VAD). */
  turn: { silenceMs: 900, maxMs: 30_000, minSpeechMs: 300 },
  /** A pitch run gives the person this long to start talking. */
  pitchNoSpeechMs: 15_000,
  /** Owy's question is over: the Mac mic opens for the answer this much later (the room's tail). */
  answerGapMs: 300,
  /** An error face stays this long, then the plain face comes back on its own. */
  errorFaceMs: 3_000,
  /** createPlaced and the board read get this long before the bridge looks for itself. */
  placeTimeoutMs: 20_000,
  /** Caption and transcript updates on a 360 px page: one per this many ms is plenty. */
  captionEveryMs: 300,
  /** The listening halo on the knob follows the Mac's mic at this rate. */
  micLevelEveryMs: 100,
} as const;

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
