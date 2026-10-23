import { and, eq, isNotNull } from "drizzle-orm";
import { Effect } from "effect";

import { staffTasks } from "../../db/schema";
import { moved } from "../../organizar/task-templates";
import { query } from "../db";

/** UTC midnight of a day: how staff_tasks keep `dayDate` */
export const taskDay = (day: string) => new Date(`${day}T00:00:00.000Z`);

/**
 * The event moved: its template tasks move with it, except the ones already done. Call it inside
 * the transaction that moved the event.
 */
export const moveTemplateTasks = (eventId: string, startDate: Date) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select({
          id: staffTasks.id,
          templateKey: staffTasks.templateKey,
          status: staffTasks.status,
          dayDate: staffTasks.dayDate,
        })
        .from(staffTasks)
        .where(and(eq(staffTasks.openSpaceId, eventId), isNotNull(staffTasks.templateKey)))
    );
    const changes = moved(
      rows.map((row) => ({ ...row, day: row.dayDate.toISOString().slice(0, 10) })),
      startDate
    );
    // A template has at most nine tasks: one update each
    yield* Effect.forEach(changes, (change) =>
      query((db) =>
        db
          .update(staffTasks)
          .set({ dayDate: taskDay(change.day) })
          .where(eq(staffTasks.id, change.id))
      )
    );

    return changes.length;
  });
