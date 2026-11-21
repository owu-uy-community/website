import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { Effect } from "effect";

import { can } from "../../authz/principal";
import { attendees, events, type RsvpQuestion } from "../../db/schema";
import { summarize, type AttendanceRow, type History } from "../../organizar/attendance";
import { sensitiveIds } from "../../organizar/presets";
import { query } from "../db";
import { CurrentUser } from "../services";

/** The event had its door used: someone came in (the rule for no-shows and the feedback audience). */
export const doorUsedAt = sql<boolean>`exists (select 1 from "attendees" as "door" where "door"."eventId" = ${events.id} and "door"."checkedInAt" is not null)`;

/**
 * How each of these people did at the community's events that ended before `before`: came, didn't
 * come, freed the seat late, said so. Private to the community's organizers (see attendance.ts):
 * callers are procedures gated on attendee:read or rsvp:review, and the door gets only "primera vez".
 */
export const historyOf = (communityId: string, userIds: string[], before: Date) =>
  Effect.gen(function* () {
    const ids = [...new Set(userIds.filter(Boolean))];
    const byUser = new Map<string, History>();
    if (ids.length === 0) return byUser;
    const rows = yield* query((db) =>
      db
        .select({
          userId: attendees.userId,
          status: attendees.status,
          checkedInAt: attendees.checkedInAt,
          cancelledAt: attendees.cancelledAt,
          excusedAt: attendees.excusedAt,
          startDate: events.startDate,
          doorUsed: doorUsedAt,
        })
        .from(attendees)
        .innerJoin(events, eq(events.id, attendees.eventId))
        .where(
          and(
            eq(events.communityId, communityId),
            eq(events.status, "published"),
            lt(events.endDate, before),
            eq(attendees.source, "owu"),
            inArray(attendees.userId, ids)
          )
        )
    );
    const grouped = Map.groupBy(rows, (row) => row.userId ?? "");
    for (const id of ids) {
      byUser.set(
        id,
        summarize(
          (grouped.get(id) ?? []).map((row): AttendanceRow => ({
            status: row.status,
            checkedIn: row.checkedInAt !== null,
            cancelledAt: row.cancelledAt,
            excusedAt: row.excusedAt,
            startDate: row.startDate,
            doorUsed: row.doorUsed,
          }))
        )
      );
    }

    return byUser;
  });

/**
 * Whether the caller sees the sensitive answers (the ID for the building): the community's admins
 * (those who can change the community itself) and site staff. Editors never do.
 */
export const seesSensitive = (communityId: string) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;

    return yield* Effect.promise(() => can(me.principal, "organization:update", communityId));
  });

/** The answers as label and value, in the questions' order, without the sensitive ones unless allowed. */
export function labelled(questions: RsvpQuestion[], answers: Record<string, string>, sensitive: boolean) {
  const hidden = sensitive ? [] : sensitiveIds(questions);

  return questions
    .filter((question) => !hidden.includes(question.id) && answers[question.id]?.trim())
    .map((question) => ({ label: question.label, value: answers[question.id] ?? "" }));
}
