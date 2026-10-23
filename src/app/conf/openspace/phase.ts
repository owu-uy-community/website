import { stampSeconds, wallClockSeconds, type NowNextSlot } from "lib/openspace/now-next";
import { slotDay } from "lib/slot-day";

import { OPEN_SPACE_TIMES } from "../talks";

/**
 * Where the afternoon is, as the live board needs it: each phase answers a different question
 * («¿cuándo arranca?», «¿qué se propuso?», «¿a dónde voy ahora?», «¿cómo quedó?»).
 *
 * Read off the board's own blocks rather than the agenda's clock times, so a board laid out at
 * other hours (a dry run, `pnpm db:seed --at=…`) walks through the same phases.
 */
export type DayPhase = "before-day" | "arrival" | "mercado" | "sesiones" | "after";

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** How long the mercado de ideas runs before the first block (45 min on the agenda). */
export const MERCADO_SECONDS =
  (minutesOf(OPEN_SPACE_TIMES.mercado.end) - minutesOf(OPEN_SPACE_TIMES.mercado.start)) * 60;

export type DayState = {
  phase: DayPhase;
  /** Until the mercado opens; negative once it has. Null without blocks. */
  secondsToMercado: number | null;
  /** Until the first block; negative once it has started. Null without blocks. */
  secondsToFirstBlock: number | null;
};

export function dayState(slots: readonly NowNextSlot[], timezone: string, at: Date): DayState {
  const active = slots.filter((slot) => slot.isActive);
  if (active.length === 0) return { phase: "before-day", secondsToMercado: null, secondsToFirstBlock: null };

  const stamps = active.map((slot) => ({
    day: slotDay(slot.date),
    start: stampSeconds(`${slotDay(slot.date)}T${slot.startTime}:00`),
    end: stampSeconds(`${slotDay(slot.date)}T${slot.endTime}:00`),
  }));
  const first = stamps.reduce((earliest, slot) => (slot.start < earliest.start ? slot : earliest));
  const lastEnd = Math.max(...stamps.map((slot) => slot.end));

  const clock = wallClockSeconds(at, timezone);
  const now = stampSeconds(clock);
  const mercado = first.start - MERCADO_SECONDS;

  const phase: DayPhase =
    now >= lastEnd
      ? "after"
      : now >= first.start
        ? "sesiones"
        : now >= mercado
          ? "mercado"
          : clock.slice(0, 10) === first.day
            ? "arrival"
            : "before-day";

  return { phase, secondsToMercado: mercado - now, secondsToFirstBlock: first.start - now };
}
