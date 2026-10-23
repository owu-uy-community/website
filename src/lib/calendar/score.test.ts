import { describe, expect, test } from "vitest";

import { SLOT_HOLD_FACTOR } from "lib/organizar/recurring";

import { scoreDays, suggest, weighedSlots, type CalendarItem, type ScoreInput, type SlotOccurrence } from "./score";

// August 2026: Monday 17, Tuesday 18, Thursday 20; Tuesday 25 is a feriado.
const base: ScoreInput = {
  communitySlug: "montevideo-js",
  topics: ["web", "lenguajes"],
  from: "2026-08-17",
  to: "2026-08-30",
  startTime: "19:00",
  durationMin: 150,
  items: [],
  now: "2026-06-01T12:00:00-03:00",
};

const item = (overrides: Partial<CalendarItem>): CalendarItem => ({
  id: "other",
  communitySlug: "python-montevideo",
  communityName: "Python Montevideo",
  title: "Meetup de agosto",
  start: "2026-08-18T19:00:00-03:00",
  end: "2026-08-18T21:00:00-03:00",
  topics: ["web"],
  kind: "event",
  isOwu: false,
  ...overrides,
});

const on = (day: string, input: Partial<ScoreInput> = {}) => {
  const found = scoreDays({ ...base, ...input }).find((score) => score.day === day);
  if (!found) throw new Error(`${day} is out of range`);

  return found;
};

describe(scoreDays, () => {
  test("a plain Tuesday is free", () => {
    expect(on("2026-08-18")).toStrictEqual({
      day: "2026-08-18",
      score: 100,
      level: "libre",
      blocked: false,
      reasons: [{ tone: "ok", text: "Nadie con público parecido ese día" }],
      holiday: null,
      period: null,
    });
  });

  test("a holiday scores below a plain Tuesday", () => {
    const holiday = on("2026-08-25");
    expect(holiday.score).toBe(40);
    expect(holiday.holiday).toBe("Declaratoria de la Independencia");
    expect(holiday.reasons).toContainEqual({ tone: "bad", text: "Feriado: Declaratoria de la Independencia" });
    expect(on("2026-08-24").reasons).toContainEqual({
      tone: "warn",
      text: "Víspera de feriado: Declaratoria de la Independencia",
    });
  });

  test("a same-slot event with similar topics costs more than one with unrelated topics", () => {
    const similar = on("2026-08-18", { items: [item({ topics: ["web"] })] });
    const unrelated = on("2026-08-18", { items: [item({ topics: ["seguridad"] })] });
    expect(similar.score).toBeLessThan(unrelated.score);
    expect(similar.reasons).toStrictEqual([
      { tone: "warn", text: "Mismo horario que Python Montevideo", itemId: "other" },
    ]);
  });

  test("an event the same day but at another time costs half, the next day only when similar", () => {
    const morning = { start: "2026-08-18T09:00:00-03:00", end: "2026-08-18T12:00:00-03:00" };
    expect(on("2026-08-18", { items: [item({ ...morning, topics: ["web", "lenguajes"] })] }).reasons).toStrictEqual([
      { tone: "warn", text: "Python Montevideo hace algo ese día (público parecido)", itemId: "other" },
    ]);
    expect(on("2026-08-17", { items: [item({ topics: ["web", "lenguajes"] })] }).score).toBe(92 - 7);
    expect(on("2026-08-17", { items: [item({ topics: ["seguridad"] })] }).score).toBe(92);
  });

  test("an OWU event day is heavily penalized", () => {
    const conf = item({
      id: "conf",
      communitySlug: "owu",
      communityName: "OWU",
      start: "2026-08-18T14:30:00-03:00",
      end: "2026-08-18T20:30:00-03:00",
      topics: [],
      isOwu: true,
    });
    expect(on("2026-08-18", { items: [conf] })).toMatchObject({ score: 55, level: "cuidado" });
  });

  test("our own event that day costs 60; our own holds don't count", () => {
    const own = { communitySlug: "montevideo-js", communityName: "Montevideo JS" };
    expect(on("2026-08-18", { items: [item({ ...own, id: "ours" })] }).reasons).toStrictEqual([
      { tone: "bad", text: "Tu comunidad ya tiene un evento ese día", itemId: "ours" },
    ]);
    expect(on("2026-08-18", { items: [item({ ...own, kind: "hold" })] }).score).toBe(100);
  });

  test("a hold costs less than a confirmed event and never shows its title", () => {
    const hold = item({ communityName: "AWS UG", title: "Taller secreto de Lambda", kind: "hold" });
    const held = on("2026-08-18", { items: [hold] });
    expect(held.score).toBeGreaterThan(on("2026-08-18", { items: [{ ...hold, kind: "event" }] }).score);
    expect(held.reasons).toStrictEqual([
      { tone: "warn", text: "Reserva tentativa de AWS UG a la misma hora", itemId: "other" },
    ]);
    expect(JSON.stringify(scoreDays({ ...base, items: [hold] }))).not.toContain("Lambda");
  });

  test("a venue's notice and its full months block days too", () => {
    const soon = { ...base, now: "2026-08-10T12:00:00-03:00" };
    const days = scoreDays({ ...soon, leadDays: 14, fullMonths: ["2026-08"] });
    const early = days.find((score) => score.day === "2026-08-20")?.reasons.map((reason) => reason.text);

    expect(early).toStrictEqual(
      expect.arrayContaining([
        "El espacio pide 14 días de anticipación",
        "El espacio ya recibe todo lo que puede ese mes",
      ])
    );
    expect(days.every((score) => score.blocked)).toBe(true);
  });

  test("venue-busy days and days the venue doesn't host are blocked and never suggested", () => {
    const days = scoreDays({ ...base, venueBusy: ["2026-08-18"], hostDays: [4, 2] });
    expect(days.find((score) => score.day === "2026-08-18")).toMatchObject({
      level: "bloqueado",
      blocked: true,
      reasons: [{ tone: "bad", text: "El espacio está ocupado ese día" }, expect.anything()],
    });
    expect(days.find((score) => score.day === "2026-08-17")?.reasons[0]).toStrictEqual({
      tone: "bad",
      text: "El espacio solo recibe los martes y jueves",
    });
    expect(suggest(days).map((score) => score.day)).toStrictEqual(["2026-08-20", "2026-08-27", "2026-08-25"]);
  });

  test("an all-Thursday history prefers Thursdays", () => {
    const history = ["2026-03-12", "2026-04-09", "2026-05-14"];
    expect(on("2026-08-20", { history }).reasons).toContainEqual({
      tone: "info",
      text: "3 de sus últimos 3 meetups fueron jueves",
    });
    expect(on("2026-08-18", { history })).toMatchObject({
      score: 85,
      reasons: expect.arrayContaining([{ tone: "warn", text: "Sus meetups suelen ser los jueves" }]),
    });
    expect(
      suggest(scoreDays({ ...base, history }))
        .slice(0, 2)
        .map((score) => score.day)
    ).toStrictEqual(["2026-08-20", "2026-08-27"]);
  });

  test("without history, a prior favors Tuesday to Thursday", () => {
    expect(["2026-08-17", "2026-08-21", "2026-08-22", "2026-08-23"].map((day) => on(day).score)).toStrictEqual([
      92, 90, 88, 80,
    ]);
    expect(on("2026-08-21").reasons).toContainEqual({ tone: "warn", text: "Es viernes" });
  });

  test("short lead times cost, past days are blocked", () => {
    const days = scoreDays({ ...base, from: "2026-08-03", to: "2026-09-01", now: "2026-08-10T12:00:00-03:00" });
    const byDay = new Map(days.map((score) => [score.day, score]));
    expect(byDay.get("2026-08-04")).toMatchObject({
      level: "bloqueado",
      reasons: expect.arrayContaining([{ tone: "bad", text: "Ya pasó" }]),
    });
    // Today still counts while the meetup hasn't started
    expect(byDay.get("2026-08-10")?.reasons).toContainEqual({
      tone: "warn",
      text: "Es hoy: poco tiempo para difundir",
    });
    expect(byDay.get("2026-08-18")?.reasons).toContainEqual({
      tone: "warn",
      text: "Faltan 8 días: poco tiempo para difundir",
    });
    // 17 days ahead, then 22
    expect(["2026-08-27", "2026-09-01"].map((day) => byDay.get(day)?.score)).toStrictEqual([90, 100]);
    expect(suggest(days).every((score) => score.day >= "2026-08-10")).toBe(true);
  });

  test("long weekends, summer and curated periods cost", () => {
    // Monday 12 Oct 2026 is a working holiday
    expect(on("2026-10-09", { from: "2026-10-09", to: "2026-10-09" }).reasons).toContainEqual({
      tone: "warn",
      text: "Fin de semana largo: el lunes es Día de la Diversidad Cultural",
    });
    expect(on("2026-12-22", { from: "2026-12-22", to: "2026-12-22" }).reasons).toContainEqual({
      tone: "bad",
      text: "Verano: mucha gente de vacaciones",
    });
    expect(on("2026-11-10", { from: "2026-11-10", to: "2026-11-10" })).toMatchObject({ score: 95 });
  });
});

describe("usual days (Nuestro día)", () => {
  const habit = (overrides: Partial<SlotOccurrence> = {}): SlotOccurrence => ({
    day: "2026-08-18",
    communitySlug: "python-montevideo",
    communityName: "Python Montevideo",
    topics: ["web"],
    start: "2026-08-18T19:00:00-03:00",
    end: "2026-08-18T21:00:00-03:00",
    label: "3.º martes · 19:00",
    ...overrides,
  });

  test("another community's usual day weighs like its hold, softened", () => {
    const hold = on("2026-08-18", { items: [item({ kind: "hold" })] });
    const usual = on("2026-08-18", { slots: [habit()] });

    expect(usual.reasons).toStrictEqual([{ tone: "info", text: "Suele ser el día de Python Montevideo" }]);
    expect(100 - usual.score).toBe(Math.round((100 - hold.score) * SLOT_HOLD_FACTOR));
  });

  test("a usual day with that community's own event or hold counts once, as the event", () => {
    const day = on("2026-08-18", { items: [item({})], slots: [habit()] });

    expect(day.reasons).toStrictEqual([{ tone: "warn", text: "Mismo horario que Python Montevideo", itemId: "other" }]);
    expect(weighedSlots([habit(), habit({ day: "2026-08-25" })], [item({ kind: "hold" })])).toStrictEqual([
      habit({ day: "2026-08-25" }),
    ]);
  });

  test("our own usual day is a hint, not a cost, and goes first among the suggestions", () => {
    const ours = habit({ communitySlug: "montevideo-js", communityName: "Montevideo JS", day: "2026-08-27" });
    const days = scoreDays({ ...base, slots: [ours] });
    const day = days.find((score) => score.day === "2026-08-27");

    expect(day?.score).toBe(100);
    expect(day?.reasons).toContainEqual({ tone: "ok", text: "Es su día habitual (3.º martes · 19:00)" });
    expect(suggest(days, 5, ["2026-08-27"])[0]?.day).toBe("2026-08-27");
  });

  test("two of our own events the same day read once", () => {
    const own = { communitySlug: "montevideo-js", communityName: "Montevideo JS" };
    const day = on("2026-08-18", { items: [item({ ...own, id: "a" }), item({ ...own, id: "b" })] });

    expect(day.reasons).toStrictEqual([{ tone: "bad", text: "Tu comunidad ya tiene un evento ese día", itemId: "a" }]);
    expect(day.score).toBe(40);
  });
});

describe(suggest, () => {
  test("picks the best days, at most two per week", () => {
    const picked = suggest(scoreDays({ ...base, to: "2026-09-13" }), 5);
    expect(picked.map((score) => score.day)).toStrictEqual([
      "2026-08-18",
      "2026-08-19",
      "2026-08-26",
      "2026-08-27",
      "2026-09-01",
    ]);
  });
});
