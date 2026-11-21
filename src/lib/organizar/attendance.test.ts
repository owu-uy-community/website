import { describe, expect, test } from "vitest";

import { cameLabel, isFirstTime, summarize, type AttendanceRow } from "./attendance";
import { dietTally, photoPreference, presetQuestion } from "./presets";

const start = new Date("2029-11-26T22:00:00.000Z");
const row = (extra: Partial<AttendanceRow>): AttendanceRow => ({
  status: "attending",
  checkedIn: false,
  cancelledAt: null,
  excusedAt: null,
  startDate: start,
  doorUsed: true,
  ...extra,
});
const hoursBefore = (hours: number) => new Date(start.getTime() - hours * 3_600_000);

describe(summarize, () => {
  test("came, didn't come, freed the seat late, said so", () => {
    expect(
      summarize([
        row({ checkedIn: true }),
        row({ checkedIn: true }),
        row({}),
        row({ status: "cancelled", cancelledAt: hoursBefore(5) }),
        row({ status: "cancelled", cancelledAt: hoursBefore(48) }),
        row({ excusedAt: hoursBefore(2) }),
      ])
    ).toStrictEqual({ attended: 2, noShows: 1, lateReleases: 1, excused: 1, seated: 4 });
  });

  test("without door data nobody is a no-show", () => {
    expect(summarize([row({ doorUsed: false })])).toMatchObject({ noShows: 0, seated: 1 });
  });

  test("the team taking a place counts as said so, not as a late release", () => {
    expect(
      summarize([row({ status: "cancelled", cancelledAt: hoursBefore(1), excusedAt: hoursBefore(1) })])
    ).toMatchObject({ lateReleases: 0, excused: 1 });
  });
});

describe(isFirstTime, () => {
  test("no past seat in the community; a release alone keeps them new", () => {
    expect(isFirstTime(summarize([]))).toBe(true);
    expect(isFirstTime(summarize([row({ status: "cancelled", cancelledAt: hoursBefore(40) })]))).toBe(true);
    expect(isFirstTime(summarize([row({ doorUsed: false })]))).toBe(false);
  });
});

describe(cameLabel, () => {
  test("only over what can be known", () => {
    expect(cameLabel(summarize([row({ checkedIn: true }), row({ checkedIn: true }), row({})]))).toBe("vino a 2 de 3");
    expect(cameLabel(summarize([row({ doorUsed: false })]))).toBeNull();
  });
});

describe(dietTally, () => {
  test("veggie and gluten-free from the diet question's answers", () => {
    const questions = [presetQuestion("dieta"), presetQuestion("foto")];
    const answers = ["Vegana", "Sin TACC", "Vegetariana y sin TACC", "Como de todo", ""].map((dieta) => ({ dieta }));

    expect(dietTally(questions, answers)).toStrictEqual({ vegetarian: 2, glutenFree: 2, answered: 4 });
    expect(dietTally([], answers)).toStrictEqual({ vegetarian: 0, glutenFree: 0, answered: 0 });
  });
});

describe(photoPreference, () => {
  test("a chip only when the person asked for care", () => {
    const questions = [presetQuestion("foto")];

    expect(photoPreference(questions, { foto: "Sí" })).toBeNull();
    expect(photoPreference(questions, { foto: "No" })).toBe("Sin fotos");
    expect(photoPreference(questions, { foto: "Preguntame antes" })).toBe("Fotos: preguntar antes");
  });
});
