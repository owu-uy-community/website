import { and, eq, gt, gte, lt, or } from "drizzle-orm";
import { Effect } from "effect";

import { addDays } from "../../calendar/holidays";
import { mergeItems, monthRange } from "../../calendar/items";
import {
  scoreDays,
  similarity,
  suggest,
  weighedSlots,
  type CalendarItem,
  type SlotOccurrence,
} from "../../calendar/score";
import { getUpcomingEvents } from "../../community/events";
import { clockTime, dayKey, montevideoIso } from "../../community/time";
import { communities, events, venues } from "../../db/schema";
import { LEGACY_COMMUNITY_SLUG } from "../../tenant";
import { query } from "../db";
import { NotFound } from "../errors";
import { occurrences, slotLabel } from "../../organizar/recurring";
import { DEFAULT_START, usualStart } from "../../organizar/times";
import { fullMonths } from "../../organizar/venue-fit";
import { busyDays } from "../venues/service";
import type { PlanInput, PlanItem, PlanResult } from "./schemas";

const HISTORY_DAYS = 548;

/**
 * A month of days scored for a meetup at the given time (the community's usual start without one):
 * OWU's published events and live holds (another community's without its title) plus the meetup-bot
 * feed, every community's usual day, holidays, the community's own habits. The items and usual days
 * come back too, for the grid.
 */
export const plan = (input: PlanInput) =>
  Effect.gen(function* () {
    const now = new Date();
    const directory = yield* query((db) =>
      db
        .select({
          id: communities.id,
          slug: communities.slug,
          name: communities.name,
          topics: communities.topics,
          isActive: communities.isActive,
          status: communities.status,
          recurringSlot: communities.recurringSlot,
        })
        .from(communities)
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
            eq(events.isActive, true),
            eq(communities.isActive, true),
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

    // OWU's own events are already in `own`, straight from the database
    const upcoming = (yield* Effect.promise(() => getUpcomingEvents())).filter((event) => event.source !== "owu");
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

    // Usual days of active communities, unless they declared a pause
    const slots = weighedSlots(
      directory.flatMap((community): SlotOccurrence[] => {
        const slot = community.recurringSlot;
        if (!slot || !community.isActive || community.status === "pausa" || !/^\d{2}:\d{2}$/.test(slot.time)) {
          return [];
        }

        return occurrences(slot, from, to).map((day) => {
          const start = new Date(montevideoIso(`${day}T${slot.time}`));

          return {
            day,
            communitySlug: community.slug,
            communityName: community.name,
            topics: community.topics,
            start: start.toISOString(),
            end: new Date(start.getTime() + slot.durationMin * 60_000).toISOString(),
            label: slotLabel(slot),
          };
        });
      }),
      items
    );

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

    const [venue] = input.venueId
      ? yield* query((db) =>
          db
            .select({
              id: venues.id,
              hostDays: venues.hostDays,
              leadDays: venues.leadDays,
              monthlyCap: venues.monthlyCap,
            })
            .from(venues)
            .where(eq(venues.id, input.venueId ?? ""))
        )
      : [];

    const busy = venue ? yield* busyDays(venue.id) : [];
    // "Lo de siempre": the start most of its past meetups had
    const usual = usualStart(past.map((row) => clockTime(row.startDate))) ?? DEFAULT_START;
    const startTime = input.startTime ?? usual;
    const days = scoreDays({
      communitySlug: ours.slug,
      topics: ours.topics,
      from,
      to,
      startTime,
      durationMin: input.durationMin,
      items,
      history: past.map((row) => dayKey(row.startDate)),
      slots,
      venueBusy: busy,
      hostDays: venue?.hostDays ?? [],
      leadDays: venue?.leadDays ?? 0,
      fullMonths: venue ? fullMonths(busy, venue.monthlyCap) : [],
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

    return {
      month: input.month,
      startTime,
      usualStart: usual,
      from,
      to,
      days,
      suggestions: suggest(
        days,
        5,
        slots.filter((slot) => slot.communitySlug === ours.slug).map((slot) => slot.day)
      ),
      items: shown,
      slots: slots.map((slot) => ({
        day: slot.day,
        communitySlug: slot.communitySlug,
        communityName: slot.communityName,
        own: slot.communitySlug === ours.slug,
        start: slot.start,
        end: slot.end,
      })),
    } satisfies PlanResult;
  });
