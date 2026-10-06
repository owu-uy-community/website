import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { schedules, tracks, type ScheduleRow } from "../../db/schema";
import { cardsDeleted } from "../board-events";
import { query } from "../db";
import { NotFound } from "../errors";
import type { CreateScheduleInput, Schedule } from "./schemas";

const toSchedule = (row: ScheduleRow): Schedule => ({
  id: row.id,
  openSpaceId: row.openSpaceId,
  name: row.name,
  startTime: row.startTime,
  endTime: row.endTime,
  date: row.date.toISOString(),
  isActive: row.isActive,
  highlightInKiosk: row.highlightInKiosk,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const scheduleNotFound = new NotFound({ entity: "schedule", message: "Ese bloque no existe" });
const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

const found = ([row]: ScheduleRow[]) => (row ? Effect.succeed(toSchedule(row)) : Effect.fail(scheduleNotFound));

export const getSchedule = (id: string) =>
  query((db) => db.select().from(schedules).where(eq(schedules.id, id))).pipe(Effect.flatMap(found));

export const listSchedules = (openSpaceId: string) =>
  query((db) =>
    db
      .select()
      .from(schedules)
      .where(eq(schedules.openSpaceId, openSpaceId))
      .orderBy(asc(schedules.date), asc(schedules.startTime))
  ).pipe(Effect.map((rows) => rows.map(toSchedule)));

export const createSchedule = (input: CreateScheduleInput) =>
  query((db) =>
    db
      .insert(schedules)
      .values({ ...input, date: new Date(input.date) })
      .returning()
  ).pipe(
    Effect.catchTag("ForeignKeyViolation", () => Effect.fail(eventNotFound)),
    Effect.flatMap(found)
  );

/** Change only the fields that were sent. */
export const updateSchedule = (id: string, { date, ...data }: Partial<Omit<CreateScheduleInput, "openSpaceId">>) =>
  query((db) =>
    db
      .update(schedules)
      .set({ ...data, ...(date === undefined ? {} : { date: new Date(date) }) })
      .where(eq(schedules.id, id))
      .returning()
  ).pipe(Effect.flatMap(found));

/** Delete a slot and its talks; the boards are told which cards went away. */
export const deleteSchedule = (id: string) =>
  Effect.gen(function* () {
    const talks = yield* query((db) => db.select({ id: tracks.id }).from(tracks).where(eq(tracks.scheduleId, id)));
    const deleted = yield* query((db) => db.delete(schedules).where(eq(schedules.id, id)).returning()).pipe(
      Effect.flatMap(found)
    );
    yield* cardsDeleted(
      deleted.openSpaceId,
      talks.map((talk) => talk.id)
    );

    return deleted;
  });
