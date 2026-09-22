/**
 * Replay a real open space card by card and score the grid each placement policy produces.
 *
 *   DATABASE_URL=… pnpm slot:replay [--event=<slug|id>] [--llm] [--embeddings]
 *
 * Why this exists: changing how we pick a slot is easy, knowing whether it got better is not. Every
 * number below is on one axis — how much two talks running at the same hour look alike — because
 * that is the one thing the practice literature agrees a scheduler is for.
 *
 * Read the result with suspicion in one specific way. With 5-6 blocks, assigning at random already
 * separates ~80% of talk pairs, so `random` is not a strawman, it is the bar. If a policy does not
 * clearly beat it, the honest conclusion is that the picking is not where the value is.
 */
import { asc, desc, eq } from "drizzle-orm";

import { db, pool } from "../src/lib/db";
import { events, rooms as roomsTable, schedules as schedulesTable, tracks as tracksTable } from "../src/lib/db/schema";
import { buildCandidates, findFreeSpot, type Candidate } from "../src/lib/orpc/ocr/services/find-spot";

interface Talk {
  title: string;
  speaker?: string;
  needsTV: boolean;
  needsWhiteboard: boolean;
  /** Where the humans actually put it, for the `actual` policy. */
  room: string;
  timeSlot: string;
}

interface Placed {
  title: string;
  speaker?: string;
  room: string;
  timeSlot: string;
}

type Policy = (candidates: Candidate[], talk: Talk, placed: Placed[]) => Promise<Candidate> | Candidate;

const args = process.argv.slice(2);
const flag = (name: string) => args.some((a) => a === `--${name}`);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

// --- similarity ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  "de la el en y a los las con para por un una que del al sin sobre como es su lo mas más o e u".split(" ")
);

const tokenize = (title: string) =>
  new Set(
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  );

/** Jaccard overlap. Coarse — it scores "Postgres para devs" and "Bases de datos" at zero — which
 *  is exactly why `--embeddings` exists. Good enough to compare policies, not to trust absolutely. */
function tokenSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);

  if (left.size === 0 || right.size === 0) return 0;

  const shared = [...left].filter((word) => right.has(word)).length;

  return shared / (left.size + right.size - shared);
}

async function buildSimilarity(titles: string[]): Promise<(a: string, b: string) => number> {
  if (!flag("embeddings")) return tokenSimilarity;

  const { embedMany, cosineSimilarity } = await import("ai");
  const { embeddings } = await embedMany({
    model: option("embedding-model") ?? "google/text-multilingual-embedding-002",
    values: titles,
  });

  const byTitle = new Map(titles.map((title, index) => [title, embeddings[index]]));

  return (a, b) => {
    const left = byTitle.get(a);
    const right = byTitle.get(b);

    return left && right ? cosineSimilarity(left, right) : 0;
  };
}

// --- scoring ------------------------------------------------------------------------------

function score(placed: Placed[], timeSlots: string[], similarity: (a: string, b: string) => number) {
  const pairs: number[] = [];

  for (const timeSlot of timeSlots) {
    const concurrent = placed.filter((talk) => talk.timeSlot === timeSlot);

    for (let i = 0; i < concurrent.length; i++) {
      for (let j = i + 1; j < concurrent.length; j++) {
        pairs.push(similarity(concurrent[i].title, concurrent[j].title));
      }
    }
  }

  const loads = timeSlots.map((slot) => placed.filter((talk) => talk.timeSlot === slot).length);
  const clashes = new Set(placed.map((t) => `${t.room}|${t.timeSlot}`)).size !== placed.length;
  const doubleBooked = timeSlots.filter((slot) => {
    const names = placed.filter((t) => t.timeSlot === slot && t.speaker).map((t) => t.speaker!.toLowerCase());

    return new Set(names).size !== names.length;
  }).length;

  return {
    meanConcurrent: pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : 0,
    maxConcurrent: pairs.length ? Math.max(...pairs) : 0,
    spread: loads.length ? Math.max(...loads) - Math.min(...loads) : 0,
    clashes,
    doubleBooked,
  };
}

/** A reference point, not the optimum: hill-climb by swapping pairs of talks between cells until
 *  nothing improves. Tells us how much of the gap a smarter picker could even close. */
function hillClimb(placed: Placed[], timeSlots: string[], similarity: (a: string, b: string) => number): Placed[] {
  let best = placed.map((talk) => ({ ...talk }));
  let bestScore = score(best, timeSlots, similarity).meanConcurrent;

  for (let pass = 0; pass < 200; pass++) {
    let improved = false;

    for (let i = 0; i < best.length; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const swapped = best.map((talk) => ({ ...talk }));

        [swapped[i].room, swapped[i].timeSlot, swapped[j].room, swapped[j].timeSlot] = [
          swapped[j].room,
          swapped[j].timeSlot,
          swapped[i].room,
          swapped[i].timeSlot,
        ];

        const next = score(swapped, timeSlots, similarity).meanConcurrent;

        if (next < bestScore - 1e-9) {
          best = swapped;
          bestScore = next;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

// --- the policies -------------------------------------------------------------------------

/**
 * What `main` did before this PR: rooms ranked by resource thrift only, candidates emitted block by
 * block and then truncated. Reproduced here, and only here, so the table below is a before/after.
 */
function legacyCandidates(talk: Talk, placed: Placed[], rooms: RoomInfo[], timeSlots: string[]): Candidate[] {
  const occupied = new Set(placed.map((t) => `${t.room}|${t.timeSlot}`));
  const resourcesOf = (room: string) => rooms.find((r) => r.name === room);
  const eligible = rooms
    .filter((room) => (!talk.needsTV || room.hasTV) && (!talk.needsWhiteboard || room.hasWhiteboard))
    .map((room) => room.name);
  const usable = eligible.length > 0 ? eligible : rooms.map((room) => room.name);
  const surplus = (room: string) => {
    const r = resourcesOf(room);

    return r ? (r.hasTV && !talk.needsTV ? 1 : 0) + (r.hasWhiteboard && !talk.needsWhiteboard ? 1 : 0) : 0;
  };

  return timeSlots
    .flatMap((timeSlot) =>
      usable
        .filter((room) => !occupied.has(`${room}|${timeSlot}`))
        .sort((a, b) => surplus(a) - surplus(b))
        .slice(0, 2)
        .map((room) => ({ room, timeSlot }))
    )
    .slice(0, 12)
    .map((cell, index) => ({
      id: `c${index}`,
      ...cell,
      hasTV: resourcesOf(cell.room)?.hasTV ?? false,
      hasWhiteboard: resourcesOf(cell.room)?.hasWhiteboard ?? false,
    }));
}

const takeFirst: Policy = (candidates) => candidates[0];
const takeRandom: Policy = (candidates) => candidates[Math.floor(Math.random() * candidates.length)];

interface RoomInfo {
  name: string;
  hasTV: boolean;
  hasWhiteboard: boolean;
}

async function replay(
  talks: Talk[],
  rooms: RoomInfo[],
  timeSlots: string[],
  policy: Policy,
  candidatesFor: (talk: Talk, placed: Placed[]) => Candidate[]
) {
  const placed: Placed[] = [];
  let firstPicks = 0;

  for (const talk of talks) {
    const candidates = candidatesFor(talk, placed);

    if (candidates.length === 0) break;

    const chosen = await policy(candidates, talk, placed);

    if (chosen.id === candidates[0].id) firstPicks++;
    placed.push({ title: talk.title, speaker: talk.speaker, room: chosen.room, timeSlot: chosen.timeSlot });
  }

  return { placed, firstPickRate: placed.length ? firstPicks / placed.length : 0 };
}

// --- main ---------------------------------------------------------------------------------

async function main() {
  const wanted = option("event");
  const allEvents = await db.select().from(events).orderBy(desc(events.startDate));
  const event = wanted
    ? allEvents.find((e) => e.id === wanted || e.slug === wanted)
    : (
        await Promise.all(
          allEvents.map(async (e) => ({
            event: e,
            count: (await db.select().from(tracksTable).where(eq(tracksTable.openSpaceId, e.id))).length,
          }))
        )
      ).find((entry) => entry.count > 0)?.event;

  if (!event) throw new Error(wanted ? `No event matching "${wanted}"` : "No event with any tracks in this database");

  const roomRows = await db.select().from(roomsTable).where(eq(roomsTable.openSpaceId, event.id));
  const scheduleRows = await db
    .select()
    .from(schedulesTable)
    .where(eq(schedulesTable.openSpaceId, event.id))
    .orderBy(asc(schedulesTable.startTime));
  const trackRows = await db
    .select()
    .from(tracksTable)
    .where(eq(tracksTable.openSpaceId, event.id))
    .orderBy(asc(tracksTable.createdAt));

  const rooms: RoomInfo[] = roomRows.map((r) => ({ name: r.name, hasTV: r.hasTV, hasWhiteboard: r.hasWhiteboard }));
  const timeSlots = scheduleRows.map((s) => `${s.startTime} - ${s.endTime}`);
  const roomById = new Map(roomRows.map((r) => [r.id, r.name]));
  const slotById = new Map(scheduleRows.map((s) => [s.id, `${s.startTime} - ${s.endTime}`]));

  const talks: Talk[] = trackRows.map((t) => ({
    title: t.title,
    speaker: t.speaker ?? undefined,
    needsTV: t.needsTV,
    needsWhiteboard: t.needsWhiteboard,
    room: roomById.get(t.roomId) ?? "",
    timeSlot: slotById.get(t.scheduleId) ?? "",
  }));

  if (talks.length === 0) throw new Error(`"${event.name}" has no tracks to replay`);

  console.log(
    `${event.name} — ${talks.length} talks, ${rooms.length} rooms × ${timeSlots.length} blocks, ` +
      `similarity: ${flag("embeddings") ? "embeddings" : "token overlap"}\n`
  );

  const similarity = await buildSimilarity(talks.map((t) => t.title));

  const current = (talk: Talk, placed: Placed[]) =>
    buildCandidates({
      speaker: talk.speaker,
      needsTV: talk.needsTV,
      needsWhiteboard: talk.needsWhiteboard,
      existingNotes: placed,
      roomsWithResources: rooms,
      availableRooms: rooms.map((r) => r.name),
      availableTimeSlots: timeSlots,
    });
  const legacy = (talk: Talk, placed: Placed[]) => legacyCandidates(talk, placed, rooms, timeSlots);

  const runs: { label: string; placed: Placed[]; firstPickRate?: number }[] = [];

  runs.push({ label: "actual (what staff did)", placed: talks.map((t) => ({ ...t })) });

  const legacyFirst = await replay(talks, rooms, timeSlots, takeFirst, legacy);

  runs.push({ label: "main: always first candidate", ...legacyFirst });

  const legacyRandom = await replay(talks, rooms, timeSlots, takeRandom, legacy);

  runs.push({ label: "main: random candidate", ...legacyRandom });

  const nextFirst = await replay(talks, rooms, timeSlots, takeFirst, current);

  runs.push({ label: "this PR: always first candidate", ...nextFirst });

  const nextRandom = await replay(talks, rooms, timeSlots, takeRandom, current);

  runs.push({ label: "this PR: random candidate", ...nextRandom });

  if (flag("llm")) {
    const llm: Policy = async (candidates, talk, placed) => {
      const result = await findFreeSpot({
        title: talk.title,
        speaker: talk.speaker ?? "",
        needsTV: talk.needsTV,
        needsWhiteboard: talk.needsWhiteboard,
        existingNotes: placed,
        roomsWithResources: rooms,
        availableRooms: rooms.map((r) => r.name),
        availableTimeSlots: timeSlots,
      });

      return (
        candidates.find((c) => c.room === result.suggestedRoom && c.timeSlot === result.suggestedTimeSlot) ??
        candidates[0]
      );
    };

    runs.push({ label: "this PR: the model picks", ...(await replay(talks, rooms, timeSlots, llm, current)) });
  }

  runs.push({
    label: "hill-climbed reference",
    placed: hillClimb(nextRandom.placed, timeSlots, similarity),
  });

  const pad = Math.max(...runs.map((r) => r.label.length));

  console.log(
    `${"policy".padEnd(pad)}   mean    max   spread  first-pick  issues\n${"-".repeat(pad + 40)}`
  );

  for (const run of runs) {
    const result = score(run.placed, timeSlots, similarity);
    const issues = [
      result.clashes ? "DOUBLE-BOOKED CELL" : "",
      result.doubleBooked > 0 ? `${result.doubleBooked} speaker clash` : "",
      run.placed.length < talks.length ? `${talks.length - run.placed.length} unplaced` : "",
    ]
      .filter(Boolean)
      .join(", ");

    console.log(
      `${run.label.padEnd(pad)}  ${result.meanConcurrent.toFixed(3)}  ${result.maxConcurrent.toFixed(3)}   ` +
        `${String(result.spread).padStart(4)}  ${
          run.firstPickRate === undefined ? "     —" : `${(run.firstPickRate * 100).toFixed(0).padStart(5)}%`
        }  ${issues}`
    );
  }

  console.log("\nmean/max: similarity between talks sharing a block — lower is better.");
  console.log("spread: busiest block minus emptiest — lower is a more evenly filled grid.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
