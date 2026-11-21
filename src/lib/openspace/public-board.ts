import "server-only";

import { Effect } from "effect";
import { cacheLife, cacheTag } from "next/cache";

import { listRooms } from "../orpc/rooms/service";
import { listSchedules } from "../orpc/schedules/service";
import { liveServices } from "../orpc/services";
import { listNotes } from "../orpc/tracks/service";
import { boardTag } from "../revalidate";

/**
 * An event's board as the public screens read it (conf.owu.uy/openspace and its refetches), from a
 * cache every server instance shares: a room full of phones costs the database one read per change,
 * not one per visit. Every board write expires it (refreshBoard, next to the board's realtime
 * events); the minutes profile only bounds an edit made outside the app.
 */
export async function publicBoard(eventId: string) {
  "use cache: remote";
  cacheTag(boardTag(eventId));
  cacheLife("minutes");

  const [rooms, schedules, tracks] = await Effect.runPromiseWith(liveServices)(
    Effect.all([listRooms(eventId), listSchedules(eventId), listNotes(eventId)], { concurrency: "unbounded" })
  );

  return { rooms, schedules, tracks };
}

export type PublicBoard = Awaited<ReturnType<typeof publicBoard>>;
