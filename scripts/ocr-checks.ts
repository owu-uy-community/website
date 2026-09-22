/**
 * The part of "Sugerir con AI" that must never depend on a model: which free cells we offer.
 *
 *   pnpm ocr:check
 *
 * No API key, no network. If these pass, a wrong suggestion is the model's judgement about
 * topics, not a bug in what we let it choose from.
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
assert.ok(
  !needsNothing.slice(0, 2).some((c) => c.room === "Sala TV"),
  "the TV room outranked two plain rooms in the same slot"
);

// Two rooms per slot, and the list stays short enough to keep the prompt small.
const perSlot = new Map<string, number>();

for (const candidate of needsNothing) {
  perSlot.set(candidate.timeSlot, (perSlot.get(candidate.timeSlot) ?? 0) + 1);
}

assert.ok(Math.max(...perSlot.values()) <= 2, "more than two rooms offered for one time slot");
assert.ok(needsNothing.length <= 12, "candidate list grew past the prompt budget");
assert.deepEqual(
  needsNothing.map((c) => c.id),
  needsNothing.map((_, index) => `c${index}`),
  "candidate ids are not the dense c0..cN the enum schema is built from"
);

// A full grid yields nothing, which is what makes findFreeSpot take its no-space branch.
const full = buildCandidates({
  ...base,
  existingNotes: timeSlots.flatMap((timeSlot) => rooms.map((room) => ({ title: "Ocupada", room, timeSlot }))),
});

assert.equal(full.length, 0, "a full grid still produced candidates");

console.log("ocr checks ok");
