/* eslint-disable no-console */
/**
 * Self-check for the two pure functions behind the live open-space view.
 * No test runner in this app, so: `pnpm tsx scripts/check-openspace.ts`.
 */
import assert from "node:assert/strict";

import { resolveNowNext, wallClockIn } from "../src/lib/openspace/now-next";
import { matchTrack, topicsFromText } from "../src/lib/openspace/topics";
import { assignMapZones, MAP_ZONES } from "../src/lib/rooms/map-zones";

// --- map zones -------------------------------------------------------------

const room = (id: string, name: string, sortOrder: number) => ({ id, name, sortOrder });

{
  // Seed names are lowercase and unaccented; the SVG's are uppercase and accented.
  const zones = assignMapZones([
    room("a", "lobby", 0),
    room("b", "centro", 1),
    room("c", "ventana", 2),
    room("d", "cueva", 3),
    room("e", "rincon", 4),
  ]);
  assert.equal(zones.get("a"), "LOBBY");
  assert.equal(zones.get("d"), "CUEVA");
  assert.equal(zones.get("e"), "RINCÓN", "accent folding must match rincon → RINCÓN");
}

{
  // A venue that renamed its rooms falls back to board order.
  const zones = assignMapZones([
    room("a", "Sala Azul", 0),
    room("b", "Sala Roja", 1),
    room("c", "Sala Verde", 2),
  ]);
  assert.deepEqual([zones.get("a"), zones.get("b"), zones.get("c")], ["LOBBY", "CENTRO", "VENTANA"]);
}

{
  // A name match claims its zone wherever it sits; the rest fill what is left.
  const zones = assignMapZones([room("a", "Sala Azul", 0), room("b", "Cueva", 1), room("c", "Sala Verde", 2)]);
  assert.equal(zones.get("b"), "CUEVA", "an explicit name keeps its zone regardless of order");
  assert.deepEqual([zones.get("a"), zones.get("c")], ["LOBBY", "CENTRO"]);
}

{
  // The floorplan has five zones; a sixth room is simply not drawn on it.
  const rooms = Array.from({ length: 6 }, (_, index) => room(`r${index}`, `Sala ${index}`, index));
  const zones = assignMapZones(rooms);
  assert.equal(zones.size, MAP_ZONES.length);
  assert.equal(zones.get("r5"), undefined);
}

{
  // Board order, not insertion order, drives the fallback.
  const zones = assignMapZones([room("a", "Tercera", 2), room("b", "Primera", 0), room("c", "Segunda", 1)]);
  assert.deepEqual([zones.get("b"), zones.get("c"), zones.get("a")], ["LOBBY", "CENTRO", "VENTANA"]);
}

// --- now / next ------------------------------------------------------------

const TZ = "America/Montevideo";
const DAY = "2026-11-07T00:00:00.000Z";

const slot = (id: string, startTime: string, endTime: string) => ({
  id,
  name: id,
  startTime,
  endTime,
  date: DAY,
  isActive: true,
});

// 25-minute blocks with 5-minute changeover gaps, as the open space actually runs.
const BLOCKS = [slot("b1", "10:15", "10:40"), slot("b2", "10:45", "11:10"), slot("b3", "11:15", "11:40")];

/** A Date that reads as the given Montevideo (UTC-3) wall clock. */
const at = (time: string) => new Date(`2026-11-07T${time}:00-03:00`);

assert.equal(wallClockIn(TZ, at("10:20")), "2026-11-07T10:20:00", "wall clock must be read in the event timezone");

{
  const before = resolveNowNext(BLOCKS, TZ, at("09:00"));
  assert.equal(before.phase, "before");
  assert.equal(before.current, null);
  assert.equal(before.next?.id, "b1");
  assert.equal(before.secondsUntilChange, 75 * 60);
}

{
  // Seconds, not just whole minutes: the header counts down every second.
  const midMinute = new Date("2026-11-07T10:20:37-03:00");
  const ticking = resolveNowNext(BLOCKS, TZ, midMinute);
  assert.equal(ticking.secondsUntilChange, 19 * 60 + 23, "must count the seconds left in the minute too");
}

{
  const running = resolveNowNext(BLOCKS, TZ, at("10:20"));
  assert.equal(running.phase, "running");
  assert.equal(running.current?.id, "b1");
  assert.equal(running.next?.id, "b2");
  assert.equal(running.secondsUntilChange, 20 * 60, "counts down to the end of the running block");
}

{
  // The 5-minute changeover: nothing is running, but the day is not over.
  const gap = resolveNowNext(BLOCKS, TZ, at("10:42"));
  assert.equal(gap.phase, "break");
  assert.equal(gap.current, null);
  assert.equal(gap.next?.id, "b2");
  assert.equal(gap.secondsUntilChange, 3 * 60);
}

{
  // A block's end is exclusive and its start inclusive — no slot claimed twice.
  assert.equal(resolveNowNext(BLOCKS, TZ, at("10:40")).phase, "break");
  assert.equal(resolveNowNext(BLOCKS, TZ, at("10:45")).current?.id, "b2");
}

{
  const after = resolveNowNext(BLOCKS, TZ, at("18:00"));
  assert.equal(after.phase, "after");
  assert.equal(after.current, null);
  assert.equal(after.next, null);
  assert.equal(after.secondsUntilChange, null);
}

{
  // A visitor in Tokyo sees the same block as someone in the room.
  const fromTokyo = new Date("2026-11-07T22:20:00+09:00"); // 10:20 in Montevideo
  assert.equal(resolveNowNext(BLOCKS, TZ, fromTokyo).current?.id, "b1");
}

{
  // Inactive blocks never win, and an empty board is "before", not a crash.
  const withInactive = [{ ...slot("b0", "10:00", "10:30"), isActive: false }, ...BLOCKS];
  assert.equal(resolveNowNext(withInactive, TZ, at("10:20")).current?.id, "b1");
  assert.equal(resolveNowNext([], TZ, at("10:20")).phase, "before");
}

{
  // Unpadded times from a hand-edited board still sort and compare correctly.
  const sloppy = [slot("x", "9:5", "9:30")];
  assert.equal(resolveNowNext(sloppy, TZ, at("09:10")).current?.id, "x");
}

// --- interest matching ------------------------------------------------------

{
  // Keyword fallback: what runs when the AI gateway is unavailable on event day.
  assert.deepEqual(topicsFromText("Next.js 15: Server Components"), ["frontend"]);
  assert.ok(topicsFromText("RAG: Retrieval Augmented Generation").includes("ia"));
  // English ML wording too — half the board is written that way.
  assert.ok(topicsFromText("Neural Networks: Conceptos Básicos").includes("ia"));
  assert.ok(topicsFromText("Introducción al Pentesting").includes("seguridad"));
  // Accent- and case-insensitive, so "Diseño" reaches the "diseno" keyword.
  assert.ok(topicsFromText("Charla sobre DISEÑO de producto").includes("producto"));
  assert.deepEqual(topicsFromText("Una charla sobre nada en particular"), []);
  // Whole words only: the two-letter keywords ("ci", "cd", "ia", "ui") used to
  // match inside longer words and mis-tag half the board.
  assert.deepEqual(
    topicsFromText("Metodología Forense Digital: análisis forense en ciberseguridad"),
    ["seguridad"],
    "'ci' inside 'ciberseguridad' must not tag the talk as DevOps"
  );
  assert.ok(topicsFromText("CI/CD moderno con GitHub Actions").includes("devops"), "but 'CI/CD' as a word must");
  // Longer keywords still match their own stems.
  assert.ok(topicsFromText("Introducción al Pentesting").includes("seguridad"), "pentest → Pentesting");
  assert.ok(topicsFromText("Diseñando APIs que duren").includes("backend"), "api → APIs");
  assert.deepEqual(topicsFromText("Guía de Uruguay"), [], "'ia' inside 'Guía' is not the IA topic");
}

{
  // Topic overlap dominates; session shape only breaks ties.
  const twoTopics = matchTrack({ topics: ["ia", "datos"], format: "charla" }, ["ia", "datos"], "debatir");
  const oneTopicRightShape = matchTrack({ topics: ["ia"], format: "debate" }, ["ia", "datos"], "debatir");
  assert.ok(twoTopics.score > oneTopicRightShape.score, "two topic hits must outrank a single hit in the right format");
  assert.deepEqual(twoTopics.matched, ["ia", "datos"]);
  assert.equal(twoTopics.suitsGoal, false);
  assert.equal(oneTopicRightShape.suitsGoal, true);
}

{
  // Same topics, different shape: the goal decides.
  const debate = matchTrack({ topics: ["ia"], format: "debate" }, ["ia"], "debatir");
  const charla = matchTrack({ topics: ["ia"], format: "charla" }, ["ia"], "debatir");
  assert.ok(debate.score > charla.score);
  // "Lo que venga" never penalises a format.
  assert.equal(matchTrack({ topics: ["ia"], format: "charla" }, ["ia"], "todo").suitsGoal, false);
}

{
  // No topic overlap scores zero EVEN IF the format is what they came for —
  // otherwise every "charla" on the board would be suggested to everyone who
  // picked "aprender", whatever it was about.
  assert.equal(matchTrack({ topics: ["mobile"], format: "charla" }, ["ia"], "aprender").score, 0);
  // An untagged track must not throw.
  assert.equal(matchTrack(undefined, ["ia"], "aprender").score, 0);
}

console.log("✅ open space checks passed");
