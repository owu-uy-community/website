import { wallClock } from "../../slot-day";

/**
 * The run of show's clock, shared by the server (GO, "Correr horarios") and the guion page
 * (margins, overrun hints). Planned starts are "HH:MM" on the event's wall clock, so this
 * works in minutes from that day's midnight.
 */

type Started = { actualStart: Date | string | null; actualEnd: Date | string | null };
type Planned = Started & { id: string; title: string; plannedStart: string; durationMin: number; fixed: boolean };

export const toMinutes = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Minutes back to "HH:MM", clamped to the same day rather than wrapping into the next. */
export const toClock = (total: number) => {
  const clamped = Math.min(23 * 60 + 59, Math.max(0, Math.round(total)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
};

/** An instant as minutes on a time zone's wall clock, its seconds as a fraction (zone offsets are whole minutes). */
export const clockMinutes = (at: Date | string | number, timeZone: string) => {
  const date = new Date(at);
  return (
    toMinutes(wallClock(date, timeZone).slice(11)) + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60_000
  );
};

/** "+3", "−2", "0": a drift or a shift, signed. */
export const signed = (minutes: number) => (minutes > 0 ? `+${minutes}` : minutes < 0 ? `−${-minutes}` : "0");

export type MomentStatus = "done" | "live" | "next" | "pending" | "skipped";

/**
 * How each moment reads. Live is started and not ended (one at a time); next is what GO starts:
 * the first one after the running one (or after the last that ran) that hasn't started. A
 * moment left behind by a GO further down is skipped.
 */
export function rundownStatus(moments: readonly Started[]) {
  const live = moments.findIndex((moment) => moment.actualStart && !moment.actualEnd);
  const anchor = live >= 0 ? live : moments.findLastIndex((moment) => moment.actualStart);
  const next = moments.findIndex((moment, index) => index > anchor && !moment.actualStart);
  const status = moments.map((moment, index): MomentStatus => {
    if (moment.actualEnd) return "done";
    if (moment.actualStart) return "live";
    if (index === next) return "next";
    return index < anchor ? "skipped" : "pending";
  });

  return { live, next, status };
}

/**
 * "Correr horarios" from one moment: the moments it moves, with their new starts. It runs up to
 * the next fixed start: fixed moments never move (what comes before them has to fit), and
 * neither does anything that already started, so the day's record stays as it happened.
 */
export function shiftPlan<T extends Planned>(moments: readonly T[], fromId: string, minutes: number) {
  const from = moments.findIndex((moment) => moment.id === fromId);
  const moved: { moment: T; plannedStart: string }[] = [];
  for (const moment of from >= 0 ? moments.slice(from) : []) {
    if (moment.fixed && moment !== moments[from]) return { moved, until: moment };
    if (!moment.fixed && !moment.actualStart) {
      moved.push({ moment, plannedStart: toClock(toMinutes(moment.plannedStart) + minutes) });
    }
  }

  return { moved, until: null };
}

export type Collision = {
  momentId: string;
  title: string;
  /** How far past the fixed start its planned end goes. */
  overMin: number;
  fixed: { id: string; title: string; plannedStart: string };
};

/** Flexible moments whose planned end runs past the next fixed start. */
export function plannedCollisions(moments: readonly Planned[]): Collision[] {
  return moments.flatMap((moment, index) => {
    const fixed = moment.fixed ? undefined : moments.slice(index + 1).find((later) => later.fixed);
    if (!fixed) return [];
    const overMin = toMinutes(moment.plannedStart) + moment.durationMin - toMinutes(fixed.plannedStart);

    return overMin > 0
      ? [
          {
            momentId: moment.id,
            title: moment.title,
            overMin,
            fixed: { id: fixed.id, title: fixed.title, plannedStart: fixed.plannedStart },
          },
        ]
      : [];
  });
}

/** The shortest a one-click "Recortar" leaves a moment. */
const MIN_TRIMMED = 5;

export type Overrun = {
  /** The moment that runs into the fixed start: the live one, or the last flexible one before it. */
  index: number;
  fixedIndex: number;
  overMin: number;
  /** A flexible moment of that stretch that can give the minutes back, and the length it would keep. */
  trim: { index: number; durationMin: number } | null;
};

/**
 * Where the rest of the day lands if everything from here on takes its planned time. A flexible
 * moment starts at its planned time or when the one before it ends, whichever is later; a fixed
 * one starts on time no matter what, so a stretch that runs long eats into it. `now` and
 * `liveStart` are minutes on the event's wall clock; `now` is null off the day (the plan is all
 * there is).
 */
export function projectDay(moments: readonly Planned[], now: number | null, liveStart: number | null) {
  const { live, status } = rundownStatus(moments);
  const floor = now ?? -Infinity;
  let cursor = floor;
  let culprit = -1;
  let stretch: number[] = [];
  if (live >= 0 && liveStart !== null) {
    cursor = Math.max(liveStart + moments[live].durationMin, floor);
    if (!moments[live].fixed) culprit = live;
  }

  let nextFixed: { index: number; marginMin: number } | null = null;
  const overruns: Overrun[] = [];
  for (let index = live + 1; index < moments.length; index += 1) {
    if (status[index] !== "next" && status[index] !== "pending") continue;
    const moment = moments[index];
    const planned = toMinutes(moment.plannedStart);
    if (!moment.fixed) {
      cursor = Math.max(planned, cursor) + moment.durationMin;
      culprit = index;
      stretch.push(index);
      continue;
    }

    const margin = planned - cursor;
    nextFixed ??= { index, marginMin: Math.floor(margin) };
    if (margin < 0 && culprit >= 0) {
      const overMin = Math.ceil(-margin);
      const giver = stretch.findLast((candidate) => moments[candidate].durationMin - overMin >= MIN_TRIMMED);
      overruns.push({
        index: culprit,
        fixedIndex: index,
        overMin,
        trim: giver === undefined ? null : { index: giver, durationMin: moments[giver].durationMin - overMin },
      });
    }
    cursor = planned + moment.durationMin;
    culprit = -1;
    stretch = [];
  }

  return { nextFixed, overruns };
}
