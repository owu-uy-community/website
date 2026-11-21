import { describe, expect, test } from "vitest";

import type { StaffTask } from "./schemas";
import { minuteOfDay, summarizeShift, taskPhase, toMinutes } from "./shift";

const DAY = "2026-11-07";
const person = (id: string, noShow = false) => ({ userId: id, name: id, image: null, noShow });
const task = (
  id: string,
  startTime: string | null,
  endTime: string | null,
  people: string[],
  extra: Partial<StaffTask> = {}
) =>
  ({
    id,
    openSpaceId: "e",
    title: id,
    notes: null,
    type: "task",
    dayDate: DAY,
    startTime,
    endTime,
    minPeople: null,
    location: null,
    status: "pending",
    statusUpdatedById: null,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    assignees: people.map((id) => person(id)),
    ...extra,
  }) satisfies StaffTask;
const arrived = (userId: string, leftAt: string | null = null) => ({
  userId,
  name: userId,
  image: null,
  arrivedAt: "2026-11-07T16:00:00.000Z",
  leftAt,
});

describe(summarizeShift, () => {
  test("at 16:42 sorts the day's people into busy, free, late, not here yet and gone", () => {
    const tasks = [
      task("puerta", "16:00", "17:30", ["ana", "beto"]),
      task("cueva", "16:40", "18:00", ["caro"]),
      task("cierre", "20:00", "21:00", ["dani"]),
      task("ausente", "16:00", "17:00", [], { assignees: [person("eli", true)] }),
      task("ayer", "16:00", "17:00", ["fede"], { dayDate: "2026-11-06" }),
    ];

    const shift = summarizeShift({
      tasks,
      arrivals: [arrived("ana"), arrived("gabi"), arrived("hugo", "2026-11-07T19:00:00.000Z")],
      day: DAY,
      nowMin: toMinutes("16:42"),
    });

    expect(shift).toMatchObject({ time: "16:42", expected: 6, onSite: 2, late: 1, free: 1 });
    expect(Object.fromEntries(shift.people.map((p) => [p.userId, [p.state, p.taskIds]]))).toStrictEqual({
      ana: ["busy", ["puerta"]],
      beto: ["late", ["puerta"]],
      // Two minutes into "cueva": not late yet.
      caro: ["away", []],
      dani: ["away", []],
      gabi: ["free", []],
      hugo: ["left", []],
    });
  });
});

describe(taskPhase, () => {
  test("a task is upcoming, under way, then overdue until someone marks it done", () => {
    const door = task("puerta", "16:00", "17:30", []);

    expect(["15:59", "16:00", "17:30"].map((at) => taskPhase(door, toMinutes(at)))).toStrictEqual([
      "upcoming",
      "now",
      "overdue",
    ]);
    expect(taskPhase({ ...door, status: "done" }, toMinutes("17:30"))).toBe("done");
  });

  test("a past day is over and a future one hasn't started", () => {
    expect(minuteOfDay("2026-11-06", DAY, 600)).toBe(1440);
    expect(minuteOfDay("2026-11-08", DAY, 600)).toBe(-1);
    expect(minuteOfDay(DAY, DAY, 600)).toBe(600);
  });
});
