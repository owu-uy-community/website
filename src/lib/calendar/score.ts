import { dayKey, montevideoIso } from "lib/community/time";
import { SLOT_HOLD_FACTOR } from "lib/organizar/recurring";

import { BLOCKERS, summer } from "./blockers";
import { addDays, daysBetween, uyHolidays, weekdayOf, type Holiday } from "./holidays";

export type CalendarItem = {
  id: string;
  communitySlug: string | null;
  communityName: string;
  /** Never shown for another community's hold */
  title: string | null;
  /** ISO with offset */
  start: string;
  end: string | null;
  topics: string[];
  kind: "event" | "hold";
  isOwu: boolean;
  venueId?: string | null;
};

/** One day a community usually meets ("Nuestro día"): a habit, not an event. */
export type SlotOccurrence = {
  day: string;
  communitySlug: string;
  communityName: string;
  topics: string[];
  /** ISO with offset, at the slot's time */
  start: string;
  end: string;
  /** "2.º jueves · 19:00" */
  label: string;
};

export type ScoreInput = {
  communitySlug: string;
  topics: string[];
  /** Inclusive days "YYYY-MM-DD", Montevideo */
  from: string;
  to: string;
  /** "19:00" */
  startTime: string;
  durationMin: number;
  /** Every known item, other communities' and our own */
  items: CalendarItem[];
  /** Days the chosen venue is taken */
  venueBusy?: string[];
  /** The venue's allowed weekdays (0 = Sunday … 6 = Saturday); empty means any */
  hostDays?: number[];
  /** The notice the venue asks for, in days */
  leadDays?: number;
  /** Months ("YYYY-MM") the venue already hosts all it can */
  fullMonths?: string[];
  /** The community's own past event days, for its weekday preference */
  history?: string[];
  /** Every community's usual days in the range (see weighedSlots): others' weigh softly, ours is a hint */
  slots?: SlotOccurrence[];
  /** ISO, injected for tests */
  now: string;
};

export type Reason = { tone: "ok" | "info" | "warn" | "bad"; text: string; itemId?: string };

export type DayScore = {
  day: string;
  score: number;
  level: "libre" | "cuidado" | "choca" | "bloqueado";
  blocked: boolean;
  reasons: Reason[];
  /** The holiday that day, for the calendar's holiday layer */
  holiday: string | null;
  /** A period that weighs on it (vacations, a FIFA window), for the big-events layer */
  period: string | null;
};

export const WEIGHTS = {
  /** Another event costs `(event + similarity·sim) × f_time × f_hold` */
  event: 10,
  similarity: 35,
  /** sim when either side is untagged or "general" */
  untaggedSim: 0.3,
  /** f_time: overlapping within `slotSlackMin`, same day, adjacent day (only when sim ≥ `adjacentMinSim`) */
  sameSlot: 1,
  sameDay: 0.5,
  adjacentDay: 0.15,
  adjacentMinSim: 0.5,
  slotSlackMin: 60,
  /** f_hold */
  hold: 0.6,
  ownEvent: 60,
  feriado: 60,
  holidayEve: 20,
  especial: 40,
  laborable: 10,
  summer: 30,
  /** Learned weekday fit, once there are `minHistory` past events */
  history: 15,
  minHistory: 3,
  /** Weekday prior without history, Sunday … Saturday */
  weekday: [20, 8, 0, 0, 0, 10, 12],
  leadShort: 25,
  leadShortDays: 10,
  leadLong: 10,
  leadLongDays: 21,
} as const;

const HOUR_MS = 3_600_000;
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAYS_PLURAL = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const list = new Intl.ListFormat("es", { type: "conjunction" });

const tone = (penalty: number): Reason["tone"] => (penalty >= 30 ? "bad" : penalty >= 10 ? "warn" : "info");

/** Jaccard overlap of topics; 0.3 when a side is untagged or general; OWU's own events draw everyone. */
export function similarity(ours: string[], item: Pick<CalendarItem, "isOwu" | "topics">) {
  if (item.isOwu) return 1;
  const mine = new Set(ours);
  const theirs = new Set(item.topics);
  if (mine.size === 0 || theirs.size === 0 || mine.has("general") || theirs.has("general")) return WEIGHTS.untaggedSim;
  const shared = [...theirs].filter((topic) => mine.has(topic)).length;

  return shared / new Set([...mine, ...theirs]).size;
}

/** An item's instants and Montevideo days; an unknown end means two hours. */
function span(item: CalendarItem) {
  const start = Date.parse(item.start);
  const end = item.end ? Date.parse(item.end) : start + 2 * HOUR_MS;

  return { start, end, firstDay: dayKey(item.start), lastDay: dayKey(new Date(end)) };
}

type Other = ReturnType<typeof span> & { item: CalendarItem; sim: number };

/** Another community's item: what it costs this day, and how to say it without leaking a hold's title. */
function itemPenalty(
  { item, sim, start, end, firstDay, lastDay }: Other,
  day: string,
  slot: { start: number; end: number }
) {
  const slack = WEIGHTS.slotSlackMin * 60_000;
  const who = item.communityName;
  const hold = item.kind === "hold";
  const close = sim >= WEIGHTS.adjacentMinSim;
  const similar = close ? " (público parecido)" : "";
  let fTime = 0;
  let text = "";
  if (start < slot.end + slack && end > slot.start - slack) {
    fTime = WEIGHTS.sameSlot;
    text = hold ? `Reserva tentativa de ${who} a la misma hora` : `Mismo horario que ${who}`;
  } else if (firstDay <= day && day <= lastDay) {
    fTime = WEIGHTS.sameDay;
    text = hold ? `Reserva tentativa de ${who} ese día` : `${who} hace algo ese día${similar}`;
  } else if (close && (addDays(day, 1) === firstDay || addDays(day, -1) === lastDay)) {
    fTime = WEIGHTS.adjacentDay;
    const when = addDays(day, 1) === firstDay ? "el día siguiente" : "el día anterior";
    text = hold ? `Reserva tentativa de ${who} ${when}` : `${who} hace algo ${when}${similar}`;
  }
  const penalty = (WEIGHTS.event + WEIGHTS.similarity * sim) * fTime * (hold ? WEIGHTS.hold : 1);

  return { penalty, text };
}

/**
 * The usual days that still mean something: a community with an event or a hold that day already
 * shows it (and weighs it) on its own, so its habit doesn't count twice.
 */
export const weighedSlots = (slots: SlotOccurrence[], items: CalendarItem[]) =>
  slots.filter(
    (slot) =>
      !items.some((item) => {
        const { firstDay, lastDay } = span(item);

        return item.communitySlug === slot.communitySlug && firstDay <= slot.day && slot.day <= lastDay;
      })
  );

/** Holidays by observed day, for every year the range touches, plus three days for eves and long weekends */
function holidaysByDay(from: string, to: string) {
  const byDay = new Map<string, Holiday[]>();
  const first = Number(from.slice(0, 4));
  const last = Number(addDays(to, 3).slice(0, 4));
  for (let year = first; year <= last; year++) {
    for (const holiday of uyHolidays(year)) byDay.set(holiday.day, [...(byDay.get(holiday.day) ?? []), holiday]);
  }

  return byDay;
}

/** How many past events fell on each weekday */
function weekdayCounts(history: string[]) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const day of history) counts[weekdayOf(day)]++;

  return counts;
}

/** Scores every day from `from` to `to` for a meetup at `startTime`, with the reasons behind each score. */
export function scoreDays(input: ScoreInput): DayScore[] {
  const {
    communitySlug,
    topics,
    items,
    venueBusy = [],
    hostDays = [],
    history = [],
    leadDays = 0,
    fullMonths = [],
  } = input;
  const now = Date.parse(input.now);
  const today = dayKey(input.now);
  const holidays = holidaysByDay(input.from, input.to);
  const counts = weekdayCounts(history);
  const maxCount = Math.max(...counts);
  // Our own holds are the dates being weighed, not clashes
  const ourDays = items
    .filter((item) => item.communitySlug === communitySlug && item.kind === "event")
    .map((item) => ({ id: item.id, day: dayKey(item.start) }));
  const others = items
    .filter((item) => item.communitySlug !== communitySlug)
    .map((item): Other => ({ item, sim: similarity(topics, item), ...span(item) }));
  const slotsByDay = new Map<string, SlotOccurrence[]>();
  for (const slot of weighedSlots(input.slots ?? [], items)) {
    slotsByDay.set(slot.day, [...(slotsByDay.get(slot.day) ?? []), slot]);
  }

  const days: DayScore[] = [];
  for (let day = input.from; day <= input.to; day = addDays(day, 1)) {
    const reasons: Reason[] = [];
    let total = 0;
    const add = (penalty: number, text: string, itemId?: string) => {
      total += penalty;
      reasons.push({ tone: tone(penalty), text, ...(itemId ? { itemId } : {}) });
    };
    const weekday = weekdayOf(day);
    const start = Date.parse(montevideoIso(`${day}T${input.startTime}`));
    const slot = { start, end: start + input.durationMin * 60_000 };

    // Blocked
    let blocked = false;
    const block = (text: string) => {
      blocked = true;
      reasons.push({ tone: "bad", text });
    };
    if (start < now) block("Ya pasó");
    if (venueBusy.includes(day)) block("El espacio está ocupado ese día");
    if (leadDays > 0 && start >= now && start < now + leadDays * 86_400_000) {
      block(`El espacio pide ${leadDays} días de anticipación`);
    }
    if (fullMonths.includes(day.slice(0, 7))) block("El espacio ya recibe todo lo que puede ese mes");
    if (hostDays.length > 0 && !hostDays.includes(weekday)) {
      block(
        `El espacio solo recibe los ${list.format(hostDays.toSorted((a, b) => a - b).map((index) => WEEKDAYS_PLURAL[index]))}`
      );
    }

    // Events
    let clash = false;
    // Once, however many of ours fall that day
    const own = ourDays.find((event) => event.day === day);
    if (own) {
      clash = true;
      add(WEIGHTS.ownEvent, "Tu comunidad ya tiene un evento ese día", own.id);
    }
    for (const other of others) {
      const { penalty, text } = itemPenalty(other, day, slot);
      if (penalty > 0) {
        clash = true;
        add(penalty, text, other.item.id);
      }
    }
    for (const usual of slotsByDay.get(day) ?? []) {
      if (usual.communitySlug === communitySlug) {
        reasons.push({ tone: "ok", text: `Es el día habitual de tu comunidad (${usual.label})` });
        continue;
      }
      // Weighs like a hold of theirs at that time, softened: it's a habit, nobody reserved it
      const habit: CalendarItem = {
        id: `slot:${usual.communitySlug}:${day}`,
        communitySlug: usual.communitySlug,
        communityName: usual.communityName,
        title: null,
        start: usual.start,
        end: usual.end,
        topics: usual.topics,
        kind: "hold",
        isOwu: false,
      };
      const { penalty } = itemPenalty({ item: habit, sim: similarity(topics, habit), ...span(habit) }, day, slot);
      if (penalty > 0) {
        clash = true;
        add(penalty * SLOT_HOLD_FACTOR, `Suele ser el día de ${usual.communityName}`);
      }
    }
    if (!clash) reasons.push({ tone: "ok", text: "Nadie con público parecido ese día" });

    // Holidays
    for (const holiday of holidays.get(day) ?? []) {
      if (holiday.kind === "feriado") add(WEIGHTS.feriado, `Feriado: ${holiday.name}`);
      if (holiday.kind === "especial") add(WEIGHTS.especial, holiday.name);
      if (holiday.kind === "laborable") add(WEIGHTS.laborable, `Feriado laborable: ${holiday.name}`);
    }
    const eve = holidays.get(addDays(day, 1))?.find((holiday) => holiday.kind === "feriado");
    const longWeekend =
      weekday === 5 ? holidays.get(addDays(day, 3))?.find((holiday) => holiday.kind !== "especial") : undefined;
    if (eve) add(WEIGHTS.holidayEve, `Víspera de feriado: ${eve.name}`);
    else if (longWeekend) add(WEIGHTS.holidayEve, `Fin de semana largo: el lunes es ${longWeekend.name}`);

    // Periods
    if (summer(day)) add(WEIGHTS.summer, "Verano: mucha gente de vacaciones");
    for (const blocker of BLOCKERS) {
      if (blocker.from <= day && day <= blocker.to) add(blocker.weight, blocker.name);
    }

    // Weekday fit
    if (history.length >= WEIGHTS.minHistory) {
      const penalty = WEIGHTS.history * (1 - counts[weekday] / maxCount);
      if (penalty > 0) {
        const favorite = WEEKDAYS_PLURAL[counts.indexOf(maxCount)];
        add(penalty, `Sus meetups suelen ser los ${favorite}`);
      } else if (counts[weekday] >= 2) {
        reasons.push({
          tone: "info",
          text: `${counts[weekday]} de sus últimos ${history.length} meetups fueron ${WEEKDAYS_PLURAL[weekday]}`,
        });
      }
    } else if (WEIGHTS.weekday[weekday] > 0) {
      add(WEIGHTS.weekday[weekday], `Es ${WEEKDAYS[weekday]}`);
    }

    // Lead time
    const lead = daysBetween(today, day);
    if (start >= now && lead < WEIGHTS.leadLongDays) {
      const left = lead === 0 ? "Es hoy" : lead === 1 ? "Falta 1 día" : `Faltan ${lead} días`;
      if (lead < WEIGHTS.leadShortDays) add(WEIGHTS.leadShort, `${left}: poco tiempo para difundir`);
      else add(WEIGHTS.leadLong, `${left}: empezá a difundir ya`);
    }

    const score = Math.round(Math.min(100, Math.max(0, 100 - total)));
    const level = blocked ? "bloqueado" : score >= 80 ? "libre" : score >= 50 ? "cuidado" : "choca";
    const holiday = (holidays.get(day) ?? []).find((item) => item.kind !== "laborable")?.name ?? null;
    const period = BLOCKERS.find((blocker) => blocker.from <= day && day <= blocker.to)?.name ?? null;
    days.push({ day, score, level, blocked, reasons, holiday, period });
  }

  return days;
}

/** How far a community's usual day jumps ahead in the suggestions (the score shown doesn't change). */
const USUAL_DAY_BONUS = 20;

/**
 * The best days that aren't blocked (so never past), at most two per week, in score order; the
 * community's usual days (`preferred`) go ahead unless they clash.
 */
export function suggest(days: DayScore[], count = 5, preferred: readonly string[] = []) {
  const usual = new Set(preferred);
  const rank = (day: DayScore) => day.score + (usual.has(day.day) && day.level !== "choca" ? USUAL_DAY_BONUS : 0);
  const perWeek = new Map<string, number>();
  const picked: DayScore[] = [];
  for (const day of days.filter((candidate) => !candidate.blocked).toSorted((a, b) => rank(b) - rank(a))) {
    if (picked.length === count) break;
    const monday = addDays(day.day, -((weekdayOf(day.day) + 6) % 7));
    const taken = perWeek.get(monday) ?? 0;
    if (taken < 2) {
      perWeek.set(monday, taken + 1);
      picked.push(day);
    }
  }

  return picked;
}
