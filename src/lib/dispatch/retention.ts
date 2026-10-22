import { and, eq, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import { Effect } from "effect";

import { attendees, emailDeliveries, events } from "../db/schema";
import { query } from "../orpc/db";

const DAY = 86_400_000;

/**
 * Keep only what's still needed (Ley 18.331): sent and failed emails go after 180 days, and a year
 * after an event OWU's own sign-ups lose their name, email and answers. Counts and check-ins stay.
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
    const anonymized = yield* query((db) =>
      db
        .update(attendees)
        .set({ name: "Anónimo", email: "", userId: null, answers: {}, barcode: null })
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

    return { emails: emails.length, attendees: anonymized.length };
  });
