import { and, eq, gt, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { Effect } from "effect";

import { attendees, emailDeliveries, events } from "../db/schema";
import { CI_ID } from "../organizar/presets";
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
    // The ID, a week after the event: by its answer key, whether or not the event still asks for it
    const sensitive = yield* query((db) =>
      db
        .update(attendees)
        .set({ answers: sql`${attendees.answers} - ${CI_ID}::text` })
        .where(
          and(
            sql`${attendees.answers} ? ${CI_ID}::text`,
            inArray(
              attendees.eventId,
              db
                .select({ id: events.id })
                .from(events)
                .where(lt(events.endDate, new Date(now.getTime() - SENSITIVE_DAYS * DAY)))
            )
          )
        )
        .returning({ id: attendees.id })
    );
    const purged = sensitive.length;
    // The ID lists mailed to the host carry the same numbers: their copy in the outbox goes too
    yield* query((db) =>
      db
        .update(emailDeliveries)
        .set({ html: "", text: "", attachments: [] })
        .where(
          and(
            eq(emailDeliveries.kind, "venue_id_list"),
            inArray(emailDeliveries.status, ["sent", "failed"]),
            ne(emailDeliveries.text, ""),
            lt(emailDeliveries.createdAt, new Date(now.getTime() - (SENSITIVE_DAYS + 1) * DAY))
          )
        )
    );
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
