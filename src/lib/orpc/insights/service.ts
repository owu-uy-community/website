import { and, asc, count, eq, gt, inArray, isNotNull, lt, max, ne, or, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import { dayKey } from "../../community/time";
import {
  activity,
  attendees,
  auditLog,
  communities,
  communityFollowers,
  communityMembers,
  events,
  surveyResponses,
  surveys,
  user,
  venues,
} from "../../db/schema";
import { daysSince, healthOf } from "../../organizar/health";
import {
  attended,
  lastQuarters,
  npsOf,
  quarterOf,
  RETURN_WINDOW_DAYS,
  speakerStats,
  visitStats,
  type PastEvent,
} from "../../organizar/insights";
import { activeAt } from "../../organizar/outreach";
import { csvCell } from "../attendees/service";
import { query } from "../db";
import { NotFound } from "../errors";
import type { Impact, Insights, OwuInsights } from "./schemas";

const DAY = 86_400_000;
/** Who counts as an organizer: editors and up (custom roles aside) */
const ORGANIZER_ROLES = ["owner", "admin", "editor"];

const communityNotFound = new NotFound({ entity: "community", message: "Esa comunidad no existe" });

/** Each community's last event that ended, and whether something is ahead (published, or a live hold). */
export const calendarFacts = (communityIds: string[] | null) =>
  Effect.gen(function* () {
    const now = new Date();
    const scope = communityIds ? inArray(events.communityId, communityIds) : undefined;
    const [last, ahead] = yield* Effect.all([
      query((db) =>
        db
          .select({ communityId: events.communityId, at: max(events.endDate) })
          .from(events)
          .where(and(scope, eq(events.status, "published"), eq(events.isActive, true), lt(events.endDate, now)))
          .groupBy(events.communityId)
      ),
      query((db) =>
        db
          .selectDistinct({ communityId: events.communityId })
          .from(events)
          .where(
            and(
              scope,
              eq(events.isActive, true),
              or(
                and(eq(events.status, "published"), gt(events.endDate, now)),
                and(eq(events.status, "draft"), gt(events.heldUntil, now))
              )
            )
          )
      ),
    ]);
    const upcoming = new Set(ahead.map((row) => row.communityId));

    return (communityId: string) => ({
      lastEventAt: last.find((row) => row.communityId === communityId)?.at ?? null,
      hasUpcoming: upcoming.has(communityId),
    });
  });

/**
 * The editors and up of each community, with when each last did something there: a change through
 * the API (the audit log) or a line in an event's activity.
 */
export const organizerActivity = (communityIds: string[] | null) =>
  query((db) =>
    db
      .select({
        communityId: communityMembers.communityId,
        userId: communityMembers.userId,
        name: user.name,
        email: user.email,
        role: communityMembers.role,
        lastActiveAt: sql<Date | null>`greatest(
          (select max(${auditLog.createdAt}) from ${auditLog}
            where ${auditLog.actorId} = ${communityMembers.userId} and ${auditLog.communityId} = ${communityMembers.communityId}),
          (select max(${activity.createdAt}) from ${activity} inner join ${events} on ${events.id} = ${activity.eventId}
            where ${activity.actorId} = ${communityMembers.userId} and ${events.communityId} = ${communityMembers.communityId})
        )`.mapWith(auditLog.createdAt),
      })
      .from(communityMembers)
      .innerJoin(user, eq(user.id, communityMembers.userId))
      .where(
        and(
          communityIds ? inArray(communityMembers.communityId, communityIds) : undefined,
          inArray(communityMembers.role, ORGANIZER_ROLES)
        )
      )
      .orderBy(asc(user.name))
  );

/** The team's editors and up and when each last did something: for Equipo's bus-factor warning. */
export const organizers = (communityId: string) =>
  organizerActivity([communityId]).pipe(
    Effect.map((rows) => ({
      active: rows.filter((row) => activeAt(row.lastActiveAt)).length,
      people: rows.map((row) => ({
        userId: row.userId,
        name: row.name,
        role: row.role,
        lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
      })),
    }))
  );

// ---------------------------------------------------------------------------
// The numbers: who came to what
// ---------------------------------------------------------------------------

type Raw = {
  events: { id: string; communityId: string; name: string; startDate: Date; speakers: string[] }[];
  seats: { eventId: string; person: string; attending: boolean; checkedIn: boolean }[];
  answers: { eventId: string; questions: { id: string; kind: string }[]; answers: Record<string, string | number> }[];
};

/**
 * Every past published event in scope with its seats (kept or checked in) and survey answers.
 * ponytail: loads the rows and counts in memory; fine for OWU's thousands, aggregate in SQL past that.
 */
const loadRaw = (communityIds: string[] | null) =>
  Effect.gen(function* () {
    const now = new Date();
    const past: SQL | undefined = and(
      communityIds ? inArray(events.communityId, communityIds) : undefined,
      eq(events.status, "published"),
      eq(events.isActive, true),
      lt(events.endDate, now)
    );
    const [rows, seats, answers] = yield* Effect.all([
      query((db) =>
        db
          .select({
            id: events.id,
            communityId: events.communityId,
            name: events.name,
            startDate: events.startDate,
            talks: events.talks,
          })
          .from(events)
          .where(past)
          .orderBy(asc(events.startDate))
      ),
      query((db) =>
        db
          .select({
            eventId: attendees.eventId,
            // One person across events: their account, else their email (Eventbrite), else the row
            person: sql<string>`coalesce(${attendees.userId}, lower(nullif(${attendees.email}, '')), ${attendees.id})`,
            attending: sql<boolean>`${attendees.status} = 'attending'`,
            checkedIn: sql<boolean>`${attendees.checkedInAt} is not null`,
          })
          .from(attendees)
          .innerJoin(events, eq(events.id, attendees.eventId))
          .where(and(past, or(eq(attendees.status, "attending"), isNotNull(attendees.checkedInAt))))
      ),
      query((db) =>
        db
          .select({ eventId: surveys.eventId, questions: surveys.questions, answers: surveyResponses.answers })
          .from(surveyResponses)
          .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
          .innerJoin(events, eq(events.id, surveys.eventId))
          .where(past)
      ),
    ]);

    return {
      events: rows.map(({ talks, ...event }) => ({ ...event, speakers: talks.map((talk) => talk.speaker) })),
      seats,
      answers,
    } satisfies Raw;
  });

/** Only what belongs to some events: a community's slice of OWU's rows. */
const sliceOf = (raw: Raw, keep: (event: Raw["events"][number]) => boolean): Raw => {
  const ids = new Set(raw.events.filter(keep).map((event) => event.id));

  return {
    events: raw.events.filter((event) => ids.has(event.id)),
    seats: raw.seats.filter((seat) => ids.has(seat.eventId)),
    answers: raw.answers.filter((answer) => ids.has(answer.eventId)),
  };
};

/** The survey's NPS for an event: its first 0–10 question. */
const npsByEvent = (answers: Raw["answers"]) => {
  const values = new Map<string, number[]>();
  for (const row of answers) {
    const question = row.questions.find((item) => item.kind === "nps");
    const value = question ? row.answers[question.id] : undefined;
    if (typeof value !== "number") continue;
    values.set(row.eventId, [...(values.get(row.eventId) ?? []), value]);
  }

  return (eventId: string) => {
    const list = values.get(eventId) ?? [];
    return { nps: npsOf(list), responses: list.length };
  };
};

const pastEvents = (raw: Raw): PastEvent[] => {
  const door = new Set(raw.seats.filter((seat) => seat.checkedIn).map((seat) => seat.eventId));

  return raw.events.map((event) => ({ id: event.id, start: event.startDate, doorUsed: door.has(event.id) }));
};

/** The numbers of a set of past events, everything a person did reduced to counts. */
function summarize(raw: Raw, now = Date.now()) {
  const past = pastEvents(raw);
  const door = new Map(past.map((event) => [event.id, event.doorUsed]));
  const stats = visitStats(past, raw.seats, now);
  const nps = npsByEvent(raw.answers);
  const seated = new Map<string, number>();
  for (const seat of raw.seats) if (seat.attending) seated.set(seat.eventId, (seated.get(seat.eventId) ?? 0) + 1);

  const recent = raw.events.slice(-12).toReversed();
  const numbers = recent.map((event) => {
    const counts = stats.perEvent.get(event.id) ?? { came: 0, firstTimers: 0 };

    return {
      id: event.id,
      name: event.name,
      startDate: event.startDate.toISOString(),
      seated: seated.get(event.id) ?? 0,
      came: door.get(event.id) ? counts.came : null,
      firstTimers: { part: counts.firstTimers, of: counts.came },
      ...nps(event.id),
    };
  });
  const withDoor = numbers.filter((event) => event.came !== null);

  return {
    quarters: lastQuarters(8, now).map((label) => ({
      label,
      events: raw.events.filter((event) => quarterOf(event.startDate) === label).length,
    })),
    events: numbers,
    showRate: {
      seated: withDoor.reduce((sum, event) => sum + event.seated, 0),
      came: withDoor.reduce((sum, event) => sum + (event.came ?? 0), 0),
      events: withDoor.length,
    },
    secondVisit: stats.secondVisit,
    returning: stats.returning,
    speakers: speakerStats(
      raw.events.map((event) => ({ start: event.startDate, speakers: event.speakers })),
      now - 365 * DAY
    ),
  };
}

const followerCount = (communityId: string | null) =>
  query((db) =>
    db
      .select({ value: count() })
      .from(communityFollowers)
      .where(communityId ? eq(communityFollowers.communityId, communityId) : undefined)
  ).pipe(Effect.map(([row]) => row?.value ?? 0));

const lastEventOf = (lastEventAt: Date | null, now: number) => ({
  lastEventAt: lastEventAt?.toISOString() ?? null,
  daysSinceLastEvent: lastEventAt ? daysSince(lastEventAt, now) : null,
});

/** A community's numbers, for its Números page. Aggregates only. */
export const communityInsights = (communityId: string) =>
  Effect.gen(function* () {
    const now = Date.now();
    const [community] = yield* query((db) =>
      db
        .select({
          status: communities.status,
          pausedUntil: communities.pausedUntil,
          publicStats: communities.publicStats,
        })
        .from(communities)
        .where(eq(communities.id, communityId))
    );
    if (!community) return yield* communityNotFound;
    const [raw, calendar, team, followers] = yield* Effect.all([
      loadRaw([communityId]),
      calendarFacts([communityId]),
      organizers(communityId),
      followerCount(communityId),
    ]);
    const facts = calendar(communityId);

    return {
      health: healthOf({ ...community, ...facts }, now),
      ...lastEventOf(facts.lastEventAt, now),
      followers,
      organizers: { active: team.active, total: team.people.length },
      ...summarize(raw, now),
      publicStats: community.publicStats,
    } satisfies Insights;
  });

/** OWU as a whole (a first-timer is new to any OWU event) and each community, for site staff. */
export const owuInsights = Effect.gen(function* () {
  const now = Date.now();
  const [list, raw, calendar, team, followers] = yield* Effect.all([
    query((db) =>
      db
        .select({
          id: communities.id,
          slug: communities.slug,
          name: communities.name,
          status: communities.status,
          pausedUntil: communities.pausedUntil,
          publicStats: communities.publicStats,
        })
        .from(communities)
        .where(eq(communities.isActive, true))
        .orderBy(asc(communities.name))
    ),
    loadRaw(null),
    calendarFacts(null),
    organizerActivity(null),
    followerCount(null),
  ]);
  const yearAgo = now - 365 * DAY;
  const lastOverall = list
    .map((community) => calendar(community.id).lastEventAt)
    .reduce<Date | null>((latest, at) => (at && (!latest || at > latest) ? at : latest), null);

  return {
    owu: { ...lastEventOf(lastOverall, now), followers, ...summarize(raw, now) },
    communities: list.map((community) => {
      const facts = calendar(community.id);
      const slice = sliceOf(raw, (event) => event.communityId === community.id);
      const lastYear = sliceOf(slice, (event) => event.startDate.getTime() >= yearAgo);
      const people = team.filter((row) => row.communityId === community.id);

      return {
        id: community.id,
        slug: community.slug,
        name: community.name,
        health: healthOf({ ...community, ...facts }, now),
        daysSinceLastEvent: facts.lastEventAt ? daysSince(facts.lastEventAt, now) : null,
        events12m: lastYear.events.length,
        came12m: attended(pastEvents(lastYear), lastYear.seats).length,
        secondVisit: visitStats(pastEvents(slice), slice.seats, now).secondVisit,
        organizers: { active: people.filter((row) => activeAt(row.lastActiveAt, now)).length, total: people.length },
        publicStats: community.publicStats,
      };
    }),
  } satisfies OwuInsights;
});

const yearOf = (date: Date) => Number(dayKey(date).slice(0, 4));

/** One year of a slice: events, distinct people who came, and how many of them were new (per `firstTimers`). */
const yearTotals = (raw: Raw, year: number, firstTimers: Map<string, { firstTimers: number }>) => {
  const slice = sliceOf(raw, (event) => yearOf(event.startDate) === year);

  return {
    year,
    events: slice.events.length,
    people: new Set(attended(pastEvents(slice), slice.seats).map((seat) => seat.person)).size,
    firstTimers: slice.events.reduce((sum, event) => sum + (firstTimers.get(event.id)?.firstTimers ?? 0), 0),
  };
};

/**
 * OWU's public impact page: this year and last, for OWU as a whole and for each community that
 * chose to show its numbers. Aggregates only, never a person.
 */
export const impact = Effect.gen(function* () {
  const now = Date.now();
  const [raw, shown] = yield* Effect.all([
    loadRaw(null),
    query((db) =>
      db
        .select({ id: communities.id, slug: communities.slug, name: communities.name })
        .from(communities)
        .where(and(eq(communities.isActive, true), eq(communities.publicStats, true)))
        .orderBy(asc(communities.name))
    ),
  ]);
  const thisYear = yearOf(new Date(now));
  const years = [thisYear, thisYear - 1];
  const owu = visitStats(pastEvents(raw), raw.seats, now).perEvent;

  return {
    years: years.map((year) => ({
      ...yearTotals(raw, year, owu),
      communities: new Set(
        raw.events.filter((event) => yearOf(event.startDate) === year).map((event) => event.communityId)
      ).size,
    })),
    communities: shown.map((community) => {
      const slice = sliceOf(raw, (event) => event.communityId === community.id);
      const own = visitStats(pastEvents(slice), slice.seats, now).perEvent;

      return { slug: community.slug, name: community.name, years: years.map((year) => yearTotals(slice, year, own)) };
    }),
  } satisfies Impact;
});

export const setPublicStats = (communityId: string, publicStats: boolean) =>
  query((db) =>
    db
      .update(communities)
      .set({ publicStats })
      .where(eq(communities.id, communityId))
      .returning({ publicStats: communities.publicStats })
  ).pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : Effect.fail(communityNotFound))));

// ---------------------------------------------------------------------------
// Export: the community's data, to take elsewhere or answer an access request
// ---------------------------------------------------------------------------

const csv = (lines: (string | number | null)[][]) =>
  `﻿${lines.map((line) => line.map((cell) => csvCell(cell === null ? "" : String(cell))).join(",")).join("\r\n")}\r\n`;

/**
 * Everything the community made in OWU, as files: its events, how many came to each (counts, never
 * who), its team, and how many follow it (never who). Attendee lists go per event, from Inscriptos.
 */
export const exportData = (communityId: string) =>
  Effect.gen(function* () {
    const now = Date.now();
    const [community] = yield* query((db) =>
      db
        .select({ slug: communities.slug, name: communities.name })
        .from(communities)
        .where(eq(communities.id, communityId))
    );
    if (!community) return yield* communityNotFound;
    const [list, counts, team, follows, raw] = yield* Effect.all([
      query((db) =>
        db
          .select({ event: events, venue: venues.name })
          .from(events)
          .leftJoin(venues, eq(venues.id, events.venueId))
          .where(and(eq(events.communityId, communityId), ne(events.status, "draft")))
          .orderBy(asc(events.startDate))
      ),
      query((db) =>
        db
          .select({
            eventId: attendees.eventId,
            seated: sql<number>`count(*) filter (where ${attendees.status} = 'attending')`.mapWith(Number),
            waitlisted: sql<number>`count(*) filter (where ${attendees.status} = 'waitlisted')`.mapWith(Number),
            came: sql<number>`count(*) filter (where ${attendees.checkedInAt} is not null)`.mapWith(Number),
          })
          .from(attendees)
          .innerJoin(events, eq(events.id, attendees.eventId))
          .where(eq(events.communityId, communityId))
          .groupBy(attendees.eventId)
      ),
      query((db) =>
        db
          .select({
            name: user.name,
            email: user.email,
            role: communityMembers.role,
            since: communityMembers.createdAt,
          })
          .from(communityMembers)
          .innerJoin(user, eq(user.id, communityMembers.userId))
          .where(eq(communityMembers.communityId, communityId))
          .orderBy(asc(user.name))
      ),
      query((db) =>
        db
          .select({ digest: communityFollowers.digest, value: count() })
          .from(communityFollowers)
          .where(eq(communityFollowers.communityId, communityId))
          .groupBy(communityFollowers.digest)
      ),
      loadRaw([communityId]),
    ]);
    const firstTimers = visitStats(pastEvents(raw), raw.seats, now).perEvent;
    const nps = npsByEvent(raw.answers);
    const followers = {
      total: follows.reduce((sum, row) => sum + row.value, 0),
      eachEvent: follows.find((row) => row.digest === "each")?.value ?? 0,
      weekly: follows.find((row) => row.digest === "weekly")?.value ?? 0,
    };
    const rows = list.map(({ event, venue }) => {
      const tally = counts.find((row) => row.eventId === event.id);
      const doorUsed = (tally?.came ?? 0) > 0;

      return {
        name: event.name,
        date: event.startDate.toISOString(),
        status: event.status,
        format: event.format,
        mode: event.mode,
        place: event.mode === "online" ? "Online" : (venue ?? event.placeName),
        capacity: event.capacity,
        talks: event.talks.length,
        seated: tally?.seated ?? 0,
        waitlisted: tally?.waitlisted ?? 0,
        came: doorUsed ? (tally?.came ?? 0) : null,
        firstTimers: firstTimers.get(event.id)?.firstTimers ?? null,
        ...nps(event.id),
      };
    });
    const stamp = dayKey(new Date(now));
    const file = (name: string) => `${community.slug}-${name}-${stamp}`;

    return {
      csv: [
        {
          filename: file("eventos.csv"),
          content: csv([
            ["Fecha", "Evento", "Estado", "Formato", "Modalidad", "Lugar", "Cupo", "Charlas"],
            ...rows.map((row) => [
              row.date,
              row.name,
              row.status,
              row.format,
              row.mode,
              row.place,
              row.capacity,
              row.talks,
            ]),
          ]),
        },
        {
          filename: file("asistencia.csv"),
          content: csv([
            ["Fecha", "Evento", "Anotados", "En espera", "Entraron", "Primera vez", "NPS de la encuesta", "Respuestas"],
            ...rows.map((row) => [
              row.date,
              row.name,
              row.seated,
              row.waitlisted,
              row.came,
              row.firstTimers,
              row.nps,
              row.responses,
            ]),
          ]),
        },
        {
          filename: file("equipo.csv"),
          content: csv([
            ["Nombre", "Email", "Rol", "Desde"],
            ...team.map((member) => [member.name, member.email, member.role, member.since.toISOString()]),
          ]),
        },
        {
          filename: file("seguidores.csv"),
          content: csv([
            ["Seguidores", "Cada evento", "Resumen semanal"],
            [followers.total, followers.eachEvent, followers.weekly],
          ]),
        },
      ],
      json: {
        filename: file("datos.json"),
        content: JSON.stringify(
          {
            community: community.name,
            exportedAt: new Date(now).toISOString(),
            followers,
            team: { size: team.length },
            events: rows,
            numbers: summarize(raw, now),
            window: { returningDays: RETURN_WINDOW_DAYS },
          },
          null,
          2
        ),
      },
    };
  });
