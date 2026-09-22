/**
 * The part of "Sugerir con AI" that must never depend on a model: which free cells we offer, in
 * which order.
 *
 *   pnpm ocr:check
 *
 * No API key, no network. If these pass, a wrong suggestion is the model's judgement about topics,
 * not a bug in what we let it choose from.
 */
import assert from "node:assert/strict";

import { buildCandidates } from "../src/lib/orpc/ocr/services/find-spot";

const rooms = ["Sala A", "Sala B", "Sala TV"];
const roomsWithResources = [
  { name: "Sala A", hasTV: false, hasWhiteboard: false },
  { name: "Sala B", hasTV: false, hasWhiteboard: true },
  { name: "Sala TV", hasTV: true, hasWhiteboard: true },
];
const timeSlots = ["10:00", "11:00", "12:00"];

const base = {
  existingNotes: [],
  roomsWithResources,
  availableRooms: rooms,
  availableTimeSlots: timeSlots,
};

// --- what may be offered -----------------------------------------------------------------

// An occupied cell is never a candidate.
const withOneTalk = buildCandidates({
  ...base,
  existingNotes: [{ title: "Ya agendada", room: "Sala A", timeSlot: "10:00" }],
});

assert.ok(
  !withOneTalk.some((c) => c.room === "Sala A" && c.timeSlot === "10:00"),
  "an occupied cell was offered as free"
);

// A talk that needs a TV only ever sees the room that has one.
const needsTV = buildCandidates({ ...base, needsTV: true });

assert.ok(needsTV.length > 0, "no candidates for a talk that needs a TV");
assert.ok(
  needsTV.every((c) => c.room === "Sala TV"),
  "offered a room without a TV to a talk that needs one"
);

// A talk that needs nothing gets the plainest room first: don't spend the TV room on it.
const needsNothing = buildCandidates(base);

assert.equal(needsNothing[0].room, "Sala A", "the scarce room was offered ahead of a plain one");

// A full grid yields nothing, which is what makes findFreeSpot take its no-space branch.
const full = buildCandidates({
  ...base,
  existingNotes: timeSlots.flatMap((timeSlot) => rooms.map((room) => ({ title: "Ocupada", room, timeSlot }))),
});

assert.equal(full.length, 0, "a full grid still produced candidates");

// --- the room a track could continue in --------------------------------------------------

// Sala TV is resource-rich, so thrift alone would bury it — but it is the only room with talks in
// it, so continuity is impossible unless it is offered.
const withTrack = buildCandidates({
  ...base,
  existingNotes: [
    { title: "Observabilidad con OpenTelemetry", room: "Sala TV", timeSlot: "10:00" },
    { title: "Postgres para devs", room: "Sala TV", timeSlot: "11:00" },
  ],
});

assert.ok(
  withTrack.some((c) => c.room === "Sala TV"),
  "the room already running a track was never offered, so continuity is unreachable"
);

// --- order and reach ---------------------------------------------------------------------

// Every block stays reachable no matter how many there are: the candidate list is round-robined
// across slots, not filled slot by slot until it runs out.
const manyRooms = ["Auditorio", "Sala 1", "Sala 2", "Sala 3", "Sala 4", "Patio"];
const manySlots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];
const wide = buildCandidates({
  existingNotes: [],
  roomsWithResources: manyRooms.map((name, index) => ({ name, hasTV: index === 0, hasWhiteboard: index === 1 })),
  availableRooms: manyRooms,
  availableTimeSlots: manySlots,
});

for (const slot of manySlots) {
  assert.ok(
    wide.some((c) => c.timeSlot === slot),
    `block ${slot} was never offered — the candidate list truncated the back of the day`
  );
}

// The emptiest block comes first, so a model that leans on the first option balances the grid
// instead of crowding the morning.
const lopsided = buildCandidates({
  ...base,
  existingNotes: [
    { title: "Una", room: "Sala A", timeSlot: "10:00" },
    { title: "Otra", room: "Sala B", timeSlot: "10:00" },
    { title: "Tercera", room: "Sala A", timeSlot: "11:00" },
  ],
});

assert.equal(lopsided[0].timeSlot, "12:00", "the busiest block was offered ahead of the emptiest one");

assert.deepEqual(
  needsNothing.map((c) => c.id),
  needsNothing.map((_, index) => `c${index}`),
  "candidate ids are not the dense c0..cN the enum schema is built from"
);

// --- one person, one room at a time ------------------------------------------------------

const speakerBusy = buildCandidates({
  ...base,
  speaker: "Agustín",
  existingNotes: [{ title: "Su otra charla", speaker: "agustin", room: "Sala A", timeSlot: "10:00" }],
});

assert.ok(
  !speakerBusy.some((c) => c.timeSlot === "10:00"),
  "offered a block where that speaker is already booked (names differ only by case and accent)"
);

// …unless avoiding the clash would leave nothing at all. Then it is the staffer's call, not ours.
const speakerBusyEverywhere = buildCandidates({
  ...base,
  speaker: "Agustín",
  availableTimeSlots: ["10:00"],
  existingNotes: [{ title: "Su otra charla", speaker: "Agustín", room: "Sala A", timeSlot: "10:00" }],
});

assert.ok(speakerBusyEverywhere.length > 0, "a speaker clash was reported as if the grid were full");

console.log("ocr checks ok");
