import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { events, schedules, tracks, type ScheduleRow } from "../../db/schema";
import { wallClock } from "../../slot-day";
import { cardsDeleted, structureChanged } from "../board-events";
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

/** Tell the boards the grid's rows changed. */
const announce = (slot: Schedule) => structureChanged(slot.openSpaceId).pipe(Effect.as(slot));

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

/** The day an event starts on its own clock, as a slot stores days: "2026-11-07T00:00:00.000Z". */
const eventDay = (eventId: string) =>
  query((db) =>
    db.select({ startDate: events.startDate, timezone: events.timezone }).from(events).where(eq(events.id, eventId))
  ).pipe(
    Effect.flatMap(([event]) =>
      event
        ? Effect.succeed(`${wallClock(event.startDate, event.timezone).slice(0, 10)}T00:00:00.000Z`)
        : Effect.fail(eventNotFound)
    )
  );

export const createSchedule = (input: CreateScheduleInput) =>
  Effect.gen(function* () {
    const date = input.date ?? (yield* eventDay(input.openSpaceId));

    return yield* query((db) =>
      db
        .insert(schedules)
        .values({ ...input, date: new Date(date) })
        .returning()
    ).pipe(
      Effect.catchTag("ForeignKeyViolation", () => Effect.fail(eventNotFound)),
      Effect.flatMap(found),
      Effect.flatMap(announce)
    );
  });

/** Change only the fields that were sent. */
export const updateSchedule = (id: string, { date, ...data }: Partial<Omit<CreateScheduleInput, "openSpaceId">>) =>
  query((db) =>
    db
      .update(schedules)
      .set({ ...data, ...(date === undefined ? {} : { date: new Date(date) }) })
      .where(eq(schedules.id, id))
      .returning()
  ).pipe(Effect.flatMap(found), Effect.flatMap(announce));

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

    return yield* announce(deleted);
  });
