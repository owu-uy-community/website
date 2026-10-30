import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import * as z from "zod";

import { attendees, events } from "../../db/schema";
import { query } from "../db";
import { CommunityScope } from "../services";

/** The counts headcount() (lib/organizar/words.ts) turns into "36 personas anotadas · 6 en espera". */
export const HeadcountSchema = z.object({
  attending: z.number(),
  /** +1s of everyone holding a seat (attending or offered), so lugares match the event page */
  guests: z.number(),
  offered: z.number(),
  waitlisted: z.number(),
  pending: z.number(),
});

/** Per published event id; events nobody signed up for are left out (all zeros). */
export const HeadcountsSchema = z.record(z.string(), HeadcountSchema);

const count = (status: string) => sql<number>`count(*) filter (where ${attendees.status} = ${status})`.mapWith(Number);

/** How many signed up to each of the community's published events, in one read for the Eventos list. */
export const headcounts = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const rows = yield* query((db) =>
    db
      .select({
        eventId: attendees.eventId,
        attending: count("attending"),
        guests:
          sql<number>`coalesce(sum(${attendees.guests}) filter (where ${attendees.status} in ('attending', 'offered')), 0)`.mapWith(
            Number
          ),
        offered: count("offered"),
        waitlisted: count("waitlisted"),
        pending: count("pending"),
      })
      .from(attendees)
      .innerJoin(events, eq(events.id, attendees.eventId))
      .where(and(eq(events.communityId, communityId), eq(events.status, "published")))
      .groupBy(attendees.eventId)
  );

  return Object.fromEntries(rows.map(({ eventId, ...counts }) => [eventId, counts])) satisfies z.infer<
    typeof HeadcountsSchema
  >;
});
