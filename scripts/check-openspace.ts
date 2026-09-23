/* eslint-disable no-console */
/**
 * Self-check for the two pure functions behind the live open-space view.
 * No test runner in this app, so: `pnpm tsx scripts/check-openspace.ts`.
 */
import assert from "node:assert/strict";

import { resolveNowNext, wallClockIn } from "../src/lib/openspace/now-next";
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

assert.equal(wallClockIn(TZ, at("10:20")), "2026-11-07T10:20", "wall clock must be read in the event timezone");

{
  const before = resolveNowNext(BLOCKS, TZ, at("09:00"));
  assert.equal(before.phase, "before");
  assert.equal(before.current, null);
  assert.equal(before.next?.id, "b1");
  assert.equal(before.secondsUntilChange, 75 * 60);
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

console.log("✅ open space checks passed");
