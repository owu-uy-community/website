import { describe, expect, test } from "vitest";

import {
  durationLabel,
  durationsWith,
  endTime,
  isDuration,
  isStartTime,
  longDay,
  monthTitle,
  shortDay,
  usualStart,
} from "./times";

describe(durationLabel, () => {
  test.each([
    [30, "30 min"],
    [60, "1 h"],
    [90, "1 h 30"],
    [360, "6 h"],
    [720, "Todo el día (12 h)"],
  ])("%i minutes read «%s»", (minutes, label) => {
    expect(durationLabel(minutes)).toBe(label);
  });
});

describe(isStartTime, () => {
  test("any quarter hour of the day, nothing else", () => {
    expect(["00:00", "10:00", "10:15", "19:45", "23:45"].map(isStartTime)).toStrictEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(["10:10", "24:00", "9:00", "", null].map(isStartTime)).toStrictEqual([false, false, false, false, false]);
  });
});

describe(isDuration, () => {
  test("half an hour to a whole day, in quarter hours", () => {
    expect([30, 75, 360, 720].map(isDuration)).toStrictEqual([true, true, true, true]);
    expect([15, 100, 735, 90.5].map(isDuration)).toStrictEqual([false, false, false, false]);
  });
});

describe(durationsWith, () => {
  test("keeps an unusual length in use among the options, in order", () => {
    expect(durationsWith(75).slice(0, 3)).toStrictEqual([60, 75, 90]);
    expect(durationsWith(120)).not.toContain(75);
  });
});

describe(endTime, () => {
  test("a Saturday workshop from 10:00 for 6 hours ends at 16:00, 24 h", () => {
    expect(endTime("2026-11-14", "10:00", 360)).toBe("16:00");
    expect(endTime("2026-11-14", "22:00", 120)).toBe("00:00");
  });
});

describe(usualStart, () => {
  test("the most common start, or none", () => {
    expect(usualStart(["19:00", "18:30", "18:30"])).toBe("18:30");
    expect(usualStart([])).toBeNull();
  });
});

describe(longDay, () => {
  test("days and months in lowercase, as the RAE writes them", () => {
    expect(longDay("2026-11-12")).toBe("jueves 12 de noviembre");
    expect(shortDay("2026-11-12")).toBe("jue 12 nov");
    expect(monthTitle("2026-10")).toBe("octubre de 2026");
  });
});
