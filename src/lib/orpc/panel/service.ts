import { and, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { Effect } from "effect";

import { dayKey } from "../../community/time";
import { activity, events, user, venueRequests, venues } from "../../db/schema";
import { plan } from "../calendar/service";
import { state as followState } from "../communities/follow";
import { query } from "../db";
import { invitations } from "../events/cohosts";
import { list, showUp, stats } from "../events/service";
import { list as listPolls } from "../polls/service";
import { CommunityScope } from "../services";
import type { PanelSummary } from "./schemas";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How far ahead a clash with another community is worth a heads-up on Inicio. */
const CONFLICT_DAYS = 60;
/** A host's answer stays news on the sidebar for this long (there's no "seen" yet). */
const ANSWERED_DAYS = 3;

/**
 * Days ours share with another community's similar event or hold, read off the calendar itself
 * (`calendar.plan`), so the heads-up names exactly what the calendar shows: a hold without its title.
 */
const conflictsOf = (communityId: string, dated: { id: string; name: string; startDate: string }[]) =>
  Effect.gen(function* () {
    const months = [...new Set(dated.map((event) => dayKey(event.startDate).slice(0, 7)))];
    const plans = yield* Effect.forEach(
      months,
      (month) => plan({ communityId, month, startTime: "19:00", durationMin: 120 }),
      { concurrency: "unbounded" }
    );
    const items = plans.flatMap((result) => result.items);

    return dated.flatMap((event) => {
      const day = dayKey(event.startDate);

      return items
        .filter((item) => !item.own && item.related && dayKey(item.start) === day)
        .map((item) => ({
          eventId: event.id,
          eventName: event.name,
          day,
          other: {
            id: item.id,
            communityName: item.communityName,
            title: item.title,
            kind: item.kind,
            start: item.start,
          },
        }));
    });
  });

/** The panel's frame and Inicio in one read: what's ahead, what needs an answer, what the team did. */
export const summary = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const now = Date.now();
  const today = dayKey(new Date(now));
  const all = yield* list(communityId);
  const ahead = all
    .filter((event) => event.status === "published" && Date.parse(event.endDate) > now)
    .toSorted((a, b) => a.startDate.localeCompare(b.startDate));
  const drafts = all.filter((event) => event.status === "draft");
  const dated = [
    ...ahead,
    ...drafts.filter((event) => event.heldUntil !== null && Date.parse(event.heldUntil) > now),
  ].filter((event) => Date.parse(event.startDate) <= now + CONFLICT_DAYS * DAY_MS);

  const [nextSeats, rate, follow, polls, invited, requests, conflicts, recent] = yield* Effect.all(
    [
      ahead[0] ? stats(ahead[0].id) : Effect.succeed(null),
      showUp,
      followState(communityId, null),
      listPolls,
      invitations,
      query((db) =>
        db
          .select({
            id: venueRequests.id,
            venueName: venues.name,
            status: venueRequests.status,
            createdAt: venueRequests.createdAt,
            expiresAt: venueRequests.expiresAt,
            respondedAt: venueRequests.respondedAt,
          })
          .from(venueRequests)
          .innerJoin(venues, eq(venues.id, venueRequests.venueId))
          .where(
            and(
              eq(venueRequests.communityId, communityId),
              or(
                and(
                  eq(venueRequests.status, "pending"),
                  lt(venueRequests.createdAt, new Date(now - 48 * HOUR_MS)),
                  gt(venueRequests.expiresAt, new Date(now))
                ),
                and(
                  inArray(venueRequests.status, ["accepted", "declined"]),
                  gt(venueRequests.respondedAt, new Date(now - ANSWERED_DAYS * DAY_MS))
                )
              )
            )
          )
          .orderBy(desc(venueRequests.createdAt))
      ),
      conflictsOf(communityId, dated),
      query((db) =>
        db
          .select({
            id: activity.id,
            verb: activity.verb,
            summary: activity.summary,
            createdAt: activity.createdAt,
            eventId: events.id,
            eventName: events.name,
            actorId: user.id,
            actorName: user.name,
            actorImage: user.image,
          })
          .from(activity)
          .innerJoin(events, eq(events.id, activity.eventId))
          .leftJoin(user, eq(user.id, activity.actorId))
          .where(eq(events.communityId, communityId))
          .orderBy(desc(activity.createdAt))
          .limit(8)
      ),
    ],
    { concurrency: "unbounded" }
  );

  return {
    ahead,
    drafts,
    nextSeats: nextSeats ? { taken: nextSeats.taken, waiting: nextSeats.waiting } : null,
    showUp: rate,
    followers: follow.followers,
    publishedThisYear: all.filter(
      (event) => event.status === "published" && dayKey(event.startDate).slice(0, 4) === today.slice(0, 4)
    ).length,
    polls: polls
      .filter(
        (poll) =>
          !poll.mine &&
          !poll.chosenDay &&
          poll.days.some((day) => day >= today) &&
          Object.keys(poll.communities.find((row) => row.id === communityId)?.answers ?? {}).length === 0
      )
      .map((poll) => ({ id: poll.id, title: poll.title, asker: poll.asker.name })),
    invitations: invited,
    venueRequests: requests.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
    })),
    conflicts,
    activity: recent.map((row) => ({
      id: row.id,
      verb: row.verb,
      summary: row.summary,
      actor: row.actorId ? { id: row.actorId, name: row.actorName ?? "", image: row.actorImage } : null,
      createdAt: row.createdAt.toISOString(),
      eventId: row.eventId,
      eventName: row.eventName,
    })),
  } satisfies PanelSummary;
});
