import { and, eq, gt, gte, lt, or } from "drizzle-orm";
import { Effect } from "effect";

import { addDays } from "../../calendar/holidays";
import { mergeItems, monthRange } from "../../calendar/items";
import { scoreDays, similarity, suggest, type CalendarItem } from "../../calendar/score";
import { getUpcomingEvents } from "../../community/events";
import { dayKey, montevideoIso } from "../../community/time";
import { communities, events } from "../../db/schema";
import { LEGACY_COMMUNITY_SLUG } from "../../tenant";
import { query } from "../db";
import { NotFound } from "../errors";
import type { PlanInput, PlanItem, PlanResult } from "./schemas";

const HISTORY_DAYS = 548;

/**
 * A month of days scored for a meetup at the given time: OWU's published events and live holds
 * (another community's without its title) plus the meetup-bot feed, holidays, the community's own
 * habits. The items come back too, for the grid.
 */
export const plan = (input: PlanInput) =>
  Effect.gen(function* () {
    const now = new Date();
    const directory = yield* query((db) =>
      db.select({ id: communities.id, slug: communities.slug, topics: communities.topics }).from(communities)
    );
    const ours = directory.find((community) => community.id === input.communityId);
    if (!ours) return yield* new NotFound({ entity: "community", message: "Esa comunidad no existe" });
    const topicsOf = new Map(directory.map((community) => [community.slug, community.topics]));

    const { from, to } = monthRange(input.month);
    const windowStart = new Date(montevideoIso(`${addDays(from, -1)}T00:00`));
    const windowEnd = new Date(montevideoIso(`${addDays(to, 2)}T00:00`));
    const rows = yield* query((db) =>
      db
        .select({
          id: events.id,
          name: events.name,
          status: events.status,
          startDate: events.startDate,
          endDate: events.endDate,
          topics: events.topics,
          communityId: communities.id,
          communitySlug: communities.slug,
          communityName: communities.name,
          communityTopics: communities.topics,
        })
        .from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(
          and(
            lt(events.startDate, windowEnd),
            gt(events.endDate, windowStart),
            or(eq(events.status, "published"), and(eq(events.status, "draft"), gt(events.heldUntil, now)))
          )
        )
    );
    const own: CalendarItem[] = rows.map((row) => ({
      id: row.id,
      communitySlug: row.communitySlug,
      communityName: row.communityName,
      title: row.status === "draft" && row.communityId !== ours.id ? null : row.name,
      start: row.startDate.toISOString(),
      end: row.endDate.toISOString(),
      topics: row.topics.length > 0 ? row.topics : row.communityTopics,
      kind: row.status === "draft" ? "hold" : "event",
      isOwu: row.communitySlug === LEGACY_COMMUNITY_SLUG,
    }));

    const upcoming = yield* Effect.promise(() => getUpcomingEvents());
    const urls = new Map(upcoming.map((event) => [event.id, event.url]));
    const feed = upcoming.map((event): CalendarItem => ({
      id: event.id,
      communitySlug: event.communitySlug,
      communityName: event.group,
      title: event.title,
      start: event.start,
      end: event.end,
      topics: (event.communitySlug && topicsOf.get(event.communitySlug)) || [],
      kind: "event",
      isOwu: event.isOwu,
    }));
    const items = mergeItems(own, feed);

    const past = yield* query((db) =>
      db
        .select({ startDate: events.startDate })
        .from(events)
        .where(
          and(
            eq(events.communityId, ours.id),
            eq(events.status, "published"),
            lt(events.startDate, now),
            gte(events.startDate, new Date(now.getTime() - HISTORY_DAYS * 86_400_000))
          )
        )
    );

    const days = scoreDays({
      communitySlug: ours.slug,
      topics: ours.topics,
      from,
      to,
      startTime: input.startTime,
      durationMin: input.durationMin,
      items,
      history: past.map((row) => dayKey(row.startDate)),
      now: now.toISOString(),
    });

    const shown = items
      .filter((item) => dayKey(item.start) <= to && dayKey(item.end ?? item.start) >= from)
      .map((item): PlanItem => ({
        id: item.id,
        communitySlug: item.communitySlug,
        communityName: item.communityName,
        title: item.title,
        start: item.start,
        end: item.end,
        kind: item.kind,
        isOwu: item.isOwu,
        own: item.communitySlug === ours.slug,
        related: item.communitySlug === ours.slug || similarity(ours.topics, item) >= 0.5,
        url: urls.get(item.id) ?? null,
      }));

    return { month: input.month, from, to, days, suggestions: suggest(days), items: shown } satisfies PlanResult;
  });
