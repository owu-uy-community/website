import { describe, expect, test } from "vitest";

import { buildCandidates } from "./slot";

/**
 * The part of "Sugerir con AI" that must never depend on a model: which free
 * cells we offer, and in which order. If these hold, a bad suggestion is the
 * model's judgement about topics, not a bug in what we let it choose from.
 */

const ROOMS = ["Sala A", "Sala B", "Sala TV"];
const SLOTS = ["10:00", "11:00", "12:00"];

function setup(overrides: Partial<Parameters<typeof buildCandidates>[0]> = {}) {
  return buildCandidates({
    existingNotes: [],
    roomsWithResources: [
      { name: "Sala A", hasTV: false, hasWhiteboard: false },
      { name: "Sala B", hasTV: false, hasWhiteboard: true },
      { name: "Sala TV", hasTV: true, hasWhiteboard: true },
    ],
    availableRooms: ROOMS,
    availableTimeSlots: SLOTS,
    ...overrides,
  });
}

const cell = (candidate: { room: string; timeSlot: string }) => `${candidate.room}@${candidate.timeSlot}`;

describe("what may be offered", () => {
  test("an occupied cell is never a candidate", () => {
    const candidates = setup({ existingNotes: [{ title: "Ya agendada", room: "Sala A", timeSlot: "10:00" }] });

    // Two rooms per block at most; at 10:00 only the two free ones remain.
    expect(candidates.filter((c) => c.timeSlot === "10:00").map((c) => c.room)).toStrictEqual(["Sala B", "Sala TV"]);
  });

  test("a talk that needs a TV only sees the room that has one", () => {
    const candidates = setup({ needsTV: true });

    expect(candidates.map((c) => c.room)).toStrictEqual(["Sala TV", "Sala TV", "Sala TV"]);
  });

  test("a talk that needs nothing gets the plainest room first", () => {
    expect(setup()[0].room).toBe("Sala A");
  });

  test("a full grid yields no candidates", () => {
    const full = SLOTS.flatMap((timeSlot) => ROOMS.map((room) => ({ title: "Ocupada", room, timeSlot })));

    expect(setup({ existingNotes: full })).toStrictEqual([]);
  });
});

describe("continuity", () => {
  test("the room already running a track is offered even though it is resource-rich", () => {
    const candidates = setup({
      existingNotes: [
        { title: "Observabilidad con OpenTelemetry", room: "Sala TV", timeSlot: "10:00" },
        { title: "Postgres para devs", room: "Sala TV", timeSlot: "11:00" },
      ],
    });

    expect(candidates.map(cell)).toContain("Sala TV@12:00");
  });
});

describe("order and reach", () => {
  test("every block stays reachable however many there are", () => {
    const rooms = ["Auditorio", "Sala 1", "Sala 2", "Sala 3", "Sala 4", "Patio"];
    const slots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];
    const candidates = buildCandidates({
      existingNotes: [],
      roomsWithResources: rooms.map((name, index) => ({ name, hasTV: index === 0, hasWhiteboard: index === 1 })),
      availableRooms: rooms,
      availableTimeSlots: slots,
    });

    expect(new Set(candidates.map((c) => c.timeSlot))).toStrictEqual(new Set(slots));
  });

  test("the emptiest block comes first", () => {
    const candidates = setup({
      existingNotes: [
        { title: "Una", room: "Sala A", timeSlot: "10:00" },
        { title: "Otra", room: "Sala B", timeSlot: "10:00" },
        { title: "Tercera", room: "Sala A", timeSlot: "11:00" },
      ],
    });

    expect(candidates[0].timeSlot).toBe("12:00");
  });

  test("candidate ids are the dense c0..cN the answer enum is built from", () => {
    const candidates = setup();

    expect(candidates.map((c) => c.id)).toStrictEqual(candidates.map((_, index) => `c${index}`));
  });
});

describe("one person, one room at a time", () => {
  test("a block where the speaker already talks is skipped, ignoring case and accents", () => {
    const candidates = setup({
      speaker: "Agustín",
      existingNotes: [{ title: "Su otra charla", speaker: "agustin", room: "Sala A", timeSlot: "10:00" }],
    });

    expect(new Set(candidates.map((c) => c.timeSlot))).toStrictEqual(new Set(["11:00", "12:00"]));
  });

  test("the clash is allowed when avoiding it would leave nothing", () => {
    const candidates = setup({
      speaker: "Agustín",
      availableTimeSlots: ["10:00"],
      existingNotes: [{ title: "Su otra charla", speaker: "Agustín", room: "Sala A", timeSlot: "10:00" }],
    });

    expect(candidates.map(cell)).toStrictEqual(["Sala B@10:00", "Sala TV@10:00"]);
  });
});
