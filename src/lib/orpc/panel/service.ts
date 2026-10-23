import { and, count, countDistinct, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { Effect, Option } from "effect";

import { addDays } from "../../calendar/holidays";
import { dayKey, montevideoIso } from "../../community/time";
import {
  activity,
  attendees,
  auditLog,
  communities,
  communityMembers,
  events,
  staffTaskAssignments,
  staffTasks,
  user,
  venueRequests,
  venues,
} from "../../db/schema";
import { ACTIVE_ORGANIZER_DAYS } from "../../organizar/health";
import { CLOSE_OUT_DAYS } from "../../organizar/rules";
import { plan } from "../calendar/service";
import type { Community } from "../communities/schemas";
import { state as followState } from "../communities/follow";
import { query } from "../db";
import { invitations } from "../events/cohosts";
import { list, showUp, stats } from "../events/service";
import { list as listPolls } from "../polls/service";
import { CommunityScope, CurrentUser } from "../services";
import type { PanelSummary } from "./schemas";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How far ahead a clash with another community is worth a heads-up on Inicio. */
const CONFLICT_DAYS = 60;
/** A host's answer stays news on the sidebar for this long (there's no "seen" yet). */
const ANSWERED_DAYS = 3;
/** Roles that organize: the ones whose silence makes a community depend on one person. */
const ORGANIZER_ROLES = ["owner", "admin", "editor"];

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

/**
 * Organizers (editor and up) who did something for the community lately: a change to one of its
 * events (activity) or to the community itself (audit log). Fewer than two, and it hangs on one person.
 */
const activeOrganizers = (communityId: string, since: Date) =>
  query((db) =>
    db
      .select({ active: countDistinct(communityMembers.userId) })
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          inArray(communityMembers.role, ORGANIZER_ROLES),
          or(
            sql`exists (select 1 from ${activity} join ${events} on ${events.id} = ${activity.eventId} where ${events.communityId} = ${communityId} and ${activity.actorId} = ${communityMembers.userId} and ${activity.createdAt} >= ${since})`,
            sql`exists (select 1 from ${auditLog} where ${auditLog.communityId} = ${communityId} and ${auditLog.actorId} = ${communityMembers.userId} and ${auditLog.createdAt} >= ${since})`
          )
        )
      )
  ).pipe(Effect.map(([row]) => row?.active ?? 0));

/** Lugares ocupados per event: anotados, their +1s and the seats offered to the waitlist. */
const seatsOf = (eventIds: string[]) =>
  eventIds.length === 0
    ? Effect.succeed({} as Record<string, number>)
    : query((db) =>
        db
          .select({
            eventId: attendees.eventId,
            seats: sql<number>`coalesce(sum(1 + ${attendees.guests}), 0)`.mapWith(Number),
          })
          .from(attendees)
          .where(and(inArray(attendees.eventId, eventIds), inArray(attendees.status, ["attending", "offered"])))
          .groupBy(attendees.eventId)
      ).pipe(
        Effect.map((rows) =>
          Object.fromEntries(eventIds.map((id) => [id, rows.find((row) => row.eventId === id)?.seats ?? 0]))
        )
      );

/** The viewer's tasks on this community's events, not done, due today, tomorrow or overdue. */
const tasksDue = (communityId: string, userId: string | null, before: Date) =>
  userId === null
    ? Effect.succeed([])
    : query((db) =>
        db
          .select({
            id: staffTasks.id,
            title: staffTasks.title,
            dayDate: staffTasks.dayDate,
            eventId: events.id,
            eventName: events.name,
          })
          .from(staffTasks)
          .innerJoin(staffTaskAssignments, eq(staffTaskAssignments.taskId, staffTasks.id))
          .innerJoin(events, eq(events.id, staffTasks.openSpaceId))
          .where(
            and(
              eq(events.communityId, communityId),
              ne(events.status, "cancelled"),
              eq(staffTaskAssignments.userId, userId),
              inArray(staffTasks.status, ["pending", "in_progress"]),
              lt(staffTasks.dayDate, before)
            )
          )
          .orderBy(staffTasks.dayDate)
          .limit(10)
      ).pipe(
        Effect.map((rows) =>
          rows.map((row) => ({
            id: row.id,
            title: row.title,
            eventId: row.eventId,
            eventName: row.eventName,
            day: dayKey(row.dayDate),
          }))
        )
      );

/** The panel's frame and Inicio in one read: what's ahead, what needs an answer, what the team did. */
export const summary = Effect.gen(function* () {
  const { communityId } = yield* CommunityScope;
  const viewer = yield* Effect.serviceOption(CurrentUser);
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
  const past = all
    .filter((event) => event.status === "published" && Date.parse(event.endDate) <= now)
    .toSorted((a, b) => b.startDate.localeCompare(a.startDate));

  const [
    nextSeats,
    rate,
    follow,
    polls,
    invited,
    requests,
    conflicts,
    recent,
    [community],
    [team],
    active,
    closing,
    seats,
    tasks,
  ] = yield* Effect.all(
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
      query((db) =>
        db
          .select({
            status: communities.status,
            pausedUntil: communities.pausedUntil,
            recurringSlot: communities.recurringSlot,
            description: communities.description,
            topics: communities.topics,
          })
          .from(communities)
          .where(eq(communities.id, communityId))
      ),
      query((db) =>
        db.select({ size: count() }).from(communityMembers).where(eq(communityMembers.communityId, communityId))
      ),
      activeOrganizers(communityId, new Date(now - ACTIVE_ORGANIZER_DAYS * DAY_MS)),
      query((db) =>
        db
          .select({ id: events.id, name: events.name, endDate: events.endDate })
          .from(events)
          .where(
            and(
              eq(events.communityId, communityId),
              eq(events.status, "published"),
              isNull(events.closedOutAt),
              lt(events.endDate, new Date(now)),
              gte(events.endDate, new Date(now - CLOSE_OUT_DAYS * DAY_MS))
            )
          )
          .orderBy(desc(events.endDate))
      ),
      seatsOf(ahead.filter((event) => event.capacity !== null).map((event) => event.id)),
      tasksDue(
        communityId,
        Option.isSome(viewer) ? viewer.value.id : null,
        new Date(montevideoIso(`${addDays(today, 2)}T00:00`))
      ),
    ],
    { concurrency: "unbounded" }
  );

  return {
    community: {
      status: community?.status ?? "activa",
      pausedUntil: community?.pausedUntil ?? null,
      recurringSlot: (community?.recurringSlot as Community["recurringSlot"]) ?? null,
      hasDescription: Boolean(community?.description?.trim()),
      topics: community?.topics ?? [],
    },
    lastEventAt: past[0]?.startDate ?? null,
    team: { size: team?.size ?? 0, activeOrganizers: active },
    closeOut: closing.map((event) => ({ ...event, endDate: event.endDate.toISOString() })),
    seats,
    myTasks: tasks,
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
          !poll.closedAt &&
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
