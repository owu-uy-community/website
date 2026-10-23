import { and, eq, gt, isNotNull, lt, or } from "drizzle-orm";
import { Effect } from "effect";

import { addDays } from "../../calendar/holidays";
import { dayKey, montevideoIso } from "../../community/time";
import { communities, events, type RecurringSlot } from "../../db/schema";
import { emptySlotEmail } from "../../email/recurring-templates";
import { enqueueEmail } from "../../email/outbox";
import { occurrenceName, occurrences, SLOT_EMAIL_FROM_DAYS, SLOT_NUDGE_DAYS } from "../../organizar/recurring";
import { query } from "../db";
import { organizerEmails } from "../events/service";

const DAY_MS = 86_400_000;

/**
 * Six weeks before each of a community's usual days, if it has nothing on it (an event or a live
 * hold), its organizers get one email: build it, give it up or do something light. The window is
 * the week before the six, so a tick a day finds every occurrence; the dedupe key keeps it to one
 * email per person, community and date however often the tick runs.
 */
export const nudgeEmptySlots = Effect.gen(function* () {
  const now = new Date();
  const today = dayKey(now);
  const from = addDays(today, SLOT_EMAIL_FROM_DAYS);
  const to = addDays(today, SLOT_NUDGE_DAYS);
  const rows = yield* query((db) =>
    db
      .select({
        id: communities.id,
        slug: communities.slug,
        name: communities.name,
        status: communities.status,
        pausedUntil: communities.pausedUntil,
        recurringSlot: communities.recurringSlot,
      })
      .from(communities)
      .where(and(eq(communities.isActive, true), isNotNull(communities.recurringSlot)))
  );

  let queued = 0;
  for (const community of rows) {
    const slot = community.recurringSlot as RecurringSlot;
    // A declared pause covers its days: until the return date, or for good without one
    const days = occurrences(slot, from, to).filter(
      (day) => community.status !== "pausa" || (community.pausedUntil !== null && community.pausedUntil <= day)
    );
    for (const day of days) {
      const start = new Date(montevideoIso(`${day}T00:00`));
      const [busy] = yield* query((db) =>
        db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.communityId, community.id),
              lt(events.startDate, new Date(start.getTime() + DAY_MS)),
              gt(events.endDate, start),
              or(eq(events.status, "published"), and(eq(events.status, "draft"), gt(events.heldUntil, now)))
            )
          )
          .limit(1)
      );
      if (busy) continue;
      for (const email of yield* organizerEmails(community.id)) {
        yield* enqueueEmail({
          kind: "recurring_slot",
          to: email,
          priority: 6,
          dedupeKey: `recurring_slot:${community.id}:${day}:${email}`,
          ...emptySlotEmail({
            community: community.name,
            day: occurrenceName(day),
            calendarPath: `/organizar/panel/${community.slug}/calendario?dia=${day}&hora=${slot.time}&dur=${slot.durationMin}`,
          }),
        });
        queued++;
      }
    }
  }

  return { communities: rows.length, queued };
});
