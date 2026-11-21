/**
 * Organizá's numbers and the sentences that explain them, in one place so the wizard, Ajustes,
 * the emails and the server never disagree. Client-safe: no server imports.
 */

/** How long a date stays reserved; renewing starts the count again. */
export const HOLD_DAYS = 14;
/** Live holds a community can keep at once: enough to compare dates, not to squat a season. */
export const MAX_HOLDS = 8;

/**
 * Sign-ups close when the event starts unless the team picks another time: whoever arrives later
 * comes in at the door as a walk-in.
 */
export const RSVP_CLOSE_HINT =
  "Por defecto, la inscripción cierra cuando empieza. Quien llegue después entra en la puerta.";

/** When the post-event survey email goes out (sendFeedback sweep: 2 to 26 h after the end). */
export const FEEDBACK_EMAIL_WINDOW = { fromHours: 2, toHours: 26 } as const;
export const FEEDBACK_TIMING = "Les llega entre 2 y 26 h después de que termina, solo si la encuesta está abierta.";

/** Show-up rate assumed until a community has door data for 3 events (free meetups: 45–65%). */
export const DEFAULT_SHOW_RATE = 0.55;

/** The phases of an event day, in minutes around its start and end (see eventPhase). */
export const DAY_OPENS_MIN_BEFORE = 60;
export const DAY_CLOSES_MIN_AFTER_END = 120;
/** How long after the end the close-out stays on Inicio and the event page */
export const CLOSE_OUT_DAYS = 14;

export type EventPhase = "antes" | "dia" | "despues";

/** Where an event stands for its team: getting ready, the day itself (from an hour before), or after. */
export function eventPhase(event: { startDate: string | Date; endDate: string | Date }, now = Date.now()): EventPhase {
  const start = new Date(event.startDate).getTime();
  const end = new Date(event.endDate).getTime();
  if (now < start - DAY_OPENS_MIN_BEFORE * 60_000) return "antes";
  if (now <= end + DAY_CLOSES_MIN_AFTER_END * 60_000) return "dia";

  return "despues";
}
