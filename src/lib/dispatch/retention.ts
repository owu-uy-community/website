import { and, eq, gt, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { Effect } from "effect";

import { attendees, emailDeliveries, events } from "../db/schema";
import { sensitiveIds } from "../organizar/presets";
import { query } from "../orpc/db";

const DAY = 86_400_000;

/** The ID the building asked for is kept a week after the event, for anything that comes up at the door. */
const SENSITIVE_DAYS = 7;

/**
 * Keep only what's still needed (Ley 18.331): sent and failed emails go after 180 days, a week after
 * an event the IDs some buildings ask for go, and a year after an event OWU's own sign-ups lose
 * their name, email and answers. Counts and check-ins stay.
 */
export const retention = (now = new Date()) =>
  Effect.gen(function* () {
    const emails = yield* query((db) =>
      db
        .delete(emailDeliveries)
        .where(
          and(
            inArray(emailDeliveries.status, ["sent", "failed"]),
            lt(emailDeliveries.createdAt, new Date(now.getTime() - 180 * DAY))
          )
        )
        .returning({ id: emailDeliveries.id })
    );
    // Events that asked for the ID and ended over a week ago (within the year the rest is kept)
    const asked = yield* query((db) =>
      db
        .select({ id: events.id, questions: events.questions })
        .from(events)
        .where(
          and(
            lt(events.endDate, new Date(now.getTime() - SENSITIVE_DAYS * DAY)),
            gt(events.endDate, new Date(now.getTime() - 400 * DAY)),
            sql`${events.questions} @> '[{"preset":"ci"}]'::jsonb`
          )
        )
    );
    let purged = 0;
    for (const event of asked) {
      const ids = sql`array[${sql.join(
        sensitiveIds(event.questions).map((id) => sql`${id}`),
        sql`, `
      )}]::text[]`;
      const rows = yield* query((db) =>
        db
          .update(attendees)
          .set({ answers: sql`${attendees.answers} - ${ids}` })
          .where(and(eq(attendees.eventId, event.id), sql`${attendees.answers} ?| ${ids}`))
          .returning({ id: attendees.id })
      );
      purged += rows.length;
    }
    const anonymized = yield* query((db) =>
      db
        .update(attendees)
        .set({ name: "Anónimo", email: "", userId: null, answers: {}, barcode: null, showName: false })
        .where(
          and(
            eq(attendees.source, "owu"),
            or(isNotNull(attendees.userId), ne(attendees.email, "")),
            inArray(
              attendees.eventId,
              db
                .select({ id: events.id })
                .from(events)
                .where(lt(events.endDate, new Date(now.getTime() - 365 * DAY)))
            )
          )
        )
        .returning({ id: attendees.id })
    );

    return { emails: emails.length, sensitive: purged, attendees: anonymized.length };
  });
