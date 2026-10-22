import { createHash, randomBytes, randomInt } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { Effect } from "effect";

import { attendees, raffleDraws, raffles } from "../../db/schema";
import { query, transaction } from "../db";
import { Conflict, NotFound } from "../errors";
import { opsPing, recordActivity } from "../ops";
import * as Stage from "../owy-stage/service";
import { findEvent } from "./service";
import type { Raffle } from "./schemas";

/**
 * Which ticket comes out of the hat: the same seed, draw number and pool size always give the
 * same position, so any draw can be checked afterwards. (A 64-bit number mod a pool of a few
 * hundred: the bias is far below anything a room could notice.)
 */
export function pickIndex(seed: string, drawIndex: number, poolSize: number) {
  const digest = createHash("sha256").update(`${seed}:${drawIndex}`).digest();
  return Number(digest.readBigUInt64BE(0) % BigInt(poolSize));
}

/** "María Fernanda Pérez" → "María P.": enough on the wall, and kinder to everyone else in the hat. */
export function wallName(name: string) {
  const [first = "", ...rest] = name.replace(/[,;]/g, " ").trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]?.toUpperCase()}.` : first;
}

const raffleNotFound = new NotFound({ entity: "raffle", message: "Ese sorteo no existe" });

/** Who can still win: in the building, ticket valid, not drawn in this raffle yet. Stable order. */
const eligible = (raffle: { id: string; eventId: string }) =>
  and(
    eq(attendees.eventId, raffle.eventId),
    eq(attendees.status, "attending"),
    isNotNull(attendees.checkedInAt),
    sql`${attendees.id} not in (select ${raffleDraws.attendeeId} from ${raffleDraws} where ${raffleDraws.raffleId} = ${raffle.id})`
  );

export const listRaffles = (eventId: string) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db.select().from(raffles).where(eq(raffles.eventId, eventId)).orderBy(desc(raffles.createdAt))
    );
    const ids = rows.map((raffle) => raffle.id);
    const [draws, pools] = yield* Effect.all(
      [
        ids.length
          ? query((db) =>
              db
                .select({ draw: raffleDraws, name: attendees.name, ticketClass: attendees.ticketClass })
                .from(raffleDraws)
                .innerJoin(attendees, eq(attendees.id, raffleDraws.attendeeId))
                .where(inArray(raffleDraws.raffleId, ids))
                .orderBy(asc(raffleDraws.drawnAt))
            )
          : Effect.succeed([]),
        Effect.forEach(rows, (raffle) =>
          query((db) => db.select({ value: count() }).from(attendees).where(eligible(raffle))).pipe(
            Effect.map(([pool]) => pool?.value ?? 0)
          )
        ),
      ],
      { concurrency: "unbounded" }
    );

    return rows.map((raffle, index): Raffle => ({
      id: raffle.id,
      prize: raffle.prize,
      seed: raffle.seed,
      createdAt: raffle.createdAt.toISOString(),
      pool: pools[index] ?? 0,
      draws: draws
        .filter(({ draw }) => draw.raffleId === raffle.id)
        .map(({ draw, name, ticketClass }) => ({
          id: draw.id,
          status: draw.status,
          attendeeId: draw.attendeeId,
          name,
          ticketClass,
          poolSize: draw.poolSize,
          drawnAt: draw.drawnAt.toISOString(),
        })),
    }));
  });

export const createRaffle = (input: { eventId: string; prize: string }) =>
  Effect.gen(function* () {
    yield* findEvent(input.eventId);
    const raffle = yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .insert(raffles)
            .values({ eventId: input.eventId, prize: input.prize, seed: randomBytes(16).toString("hex") })
            .returning()
        );
        yield* recordActivity({
          eventId: input.eventId,
          verb: "raffle.created",
          entityType: "raffle",
          entityId: row.id,
          summary: `creó el sorteo «${input.prize}»`,
        });
        return row;
      })
    );
    yield* opsPing(input.eventId, "raffle");

    return { id: raffle.id };
  });

/** The raffle, locked: draws of one raffle happen one at a time. */
const lockRaffle = (raffleId: string) =>
  query((db) => db.select().from(raffles).where(eq(raffles.id, raffleId)).for("update")).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(row) : Effect.fail(raffleNotFound)))
  );

/** Take one name out of the hat (inside the raffle's lock). */
const drawFrom = (raffle: { id: string; eventId: string; seed: string }) =>
  Effect.gen(function* () {
    const [done] = yield* query((db) =>
      db.select({ value: count() }).from(raffleDraws).where(eq(raffleDraws.raffleId, raffle.id))
    );
    const pool = yield* query((db) =>
      db
        .select({ id: attendees.id, name: attendees.name })
        .from(attendees)
        .where(eligible(raffle))
        .orderBy(sql`${attendees.id} collate "C"`)
    );
    if (pool.length === 0) {
      return yield* Effect.fail(
        new Conflict({
          reason: "raffle_pool_empty",
          message: done?.value ? "Ya salieron todos los acreditados" : "Todavía no hay nadie acreditado para sortear",
        })
      );
    }
    const winner = pool[pickIndex(raffle.seed, done?.value ?? 0, pool.length)];
    yield* query((db) =>
      db.insert(raffleDraws).values({ raffleId: raffle.id, attendeeId: winner.id, poolSize: pool.length })
    );

    return winner;
  });

const announce = (eventId: string, verb: string, raffleId: string, summary: string) =>
  recordActivity({ eventId, verb, entityType: "raffle", entityId: raffleId, summary });

/** A winner, pending until they come up for the prize. One pending draw at a time. */
export const draw = (raffleId: string) =>
  Effect.gen(function* () {
    const raffle = yield* transaction(
      Effect.gen(function* () {
        const row = yield* lockRaffle(raffleId);
        const [pending] = yield* query((db) =>
          db
            .select({ id: raffleDraws.id })
            .from(raffleDraws)
            .where(and(eq(raffleDraws.raffleId, raffleId), eq(raffleDraws.status, "pending")))
        );
        if (pending) {
          return yield* Effect.fail(
            new Conflict({ reason: "raffle_pending", message: "Primero marcá si retiró el premio, o volvé a sortear" })
          );
        }
        const winner = yield* drawFrom(row);
        yield* announce(row.eventId, "raffle.drawn", row.id, `sorteó «${row.prize}»: salió ${wallName(winner.name)}`);
        return row;
      })
    );
    yield* opsPing(raffle.eventId, "raffle");

    return { ok: true as const };
  });

/** Nobody came up: the pending winner is set aside (they can't come out again) and the hat goes round once more. */
export const redraw = (raffleId: string) =>
  Effect.gen(function* () {
    const raffle = yield* transaction(
      Effect.gen(function* () {
        const row = yield* lockRaffle(raffleId);
        const set = yield* query((db) =>
          db
            .update(raffleDraws)
            .set({ status: "redrawn" })
            .where(and(eq(raffleDraws.raffleId, raffleId), eq(raffleDraws.status, "pending")))
            .returning({ id: raffleDraws.id })
        );
        if (set.length === 0) {
          return yield* Effect.fail(
            new Conflict({ reason: "raffle_nothing_pending", message: "No hay un ganador esperando para resortear" })
          );
        }
        const winner = yield* drawFrom(row);
        yield* announce(
          row.eventId,
          "raffle.redrawn",
          row.id,
          `volvió a sortear «${row.prize}»: salió ${wallName(winner.name)}`
        );
        return row;
      })
    );
    yield* opsPing(raffle.eventId, "raffle");

    return { ok: true as const };
  });

/** The winner came up and took the prize. */
export const claim = (drawId: string) =>
  Effect.gen(function* () {
    const eventId = yield* transaction(
      Effect.gen(function* () {
        const [claimed] = yield* query((db) =>
          db
            .update(raffleDraws)
            .set({ status: "claimed" })
            .where(and(eq(raffleDraws.id, drawId), eq(raffleDraws.status, "pending")))
            .returning()
        );
        if (!claimed) {
          return yield* Effect.fail(
            new Conflict({ reason: "draw_not_pending", message: "Ese ganador ya no está esperando el premio" })
          );
        }
        const [row] = yield* query((db) =>
          db
            .select({ eventId: raffles.eventId, prize: raffles.prize, name: attendees.name })
            .from(raffles)
            .innerJoin(attendees, eq(attendees.id, claimed.attendeeId))
            .where(eq(raffles.id, claimed.raffleId))
        );
        if (!row) return yield* Effect.fail(raffleNotFound);
        yield* announce(
          row.eventId,
          "raffle.claimed",
          claimed.raffleId,
          `entregó «${row.prize}» a ${wallName(row.name)}`
        );
        return row.eventId;
      })
    );
    yield* opsPing(eventId, "raffle");

    return { ok: true as const };
  });

/**
 * Put the raffle on the wall: the stage's raffle scene spins through a dozen names from the hat
 * and lands on the current winner.
 */
export const showOnWall = (raffleId: string) =>
  Effect.gen(function* () {
    const [raffle] = yield* query((db) => db.select().from(raffles).where(eq(raffles.id, raffleId)));
    if (!raffle) return yield* Effect.fail(raffleNotFound);
    const [latest] = yield* query((db) =>
      db
        .select({ attendeeId: raffleDraws.attendeeId, name: attendees.name })
        .from(raffleDraws)
        .innerJoin(attendees, eq(attendees.id, raffleDraws.attendeeId))
        .where(and(eq(raffleDraws.raffleId, raffleId), ne(raffleDraws.status, "redrawn")))
        .orderBy(desc(raffleDraws.drawnAt))
        .limit(1)
    );
    if (!latest) {
      return yield* Effect.fail(
        new Conflict({ reason: "raffle_not_drawn", message: "Primero sorteá, después lo mostramos" })
      );
    }
    const others = yield* query((db) =>
      db
        .select({ name: attendees.name })
        .from(attendees)
        .where(
          and(
            eq(attendees.eventId, raffle.eventId),
            isNotNull(attendees.checkedInAt),
            ne(attendees.id, latest.attendeeId)
          )
        )
        .orderBy(sql`random()`)
        .limit(11)
    );
    const winner = wallName(latest.name);
    // The others already come shuffled; the winner goes in at a random spot.
    const names = [...new Set(others.map((other) => wallName(other.name)))].filter((name) => name !== winner);
    names.splice(randomInt(names.length + 1), 0, winner);
    yield* Stage.setScene({
      scene: "raffle",
      params: { title: raffle.prize, names: names.join(", "), winner },
      eventId: raffle.eventId,
      restart: true,
    });

    return { ok: true as const };
  });
