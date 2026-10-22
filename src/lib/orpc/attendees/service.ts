import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { Effect, Option, Result } from "effect";

import { attendeeScans, attendeeSync, attendees, events, type AttendeeRow, type AttendeeStatus } from "../../db/schema";
import { query, transaction } from "../db";
import { Invalid, NotFound } from "../errors";
import type { Attendee as EventbriteAttendee } from "../eventbrite/schemas";
import * as Eventbrite from "../eventbrite/service";
import { tokenForEvent } from "../integrations/service";
import { opsPing, recordActivity } from "../ops";
import { CurrentUser } from "../services";
import type {
  Attendee,
  AttendeeFilters,
  AttendeeList,
  AttendeeListInput,
  AttendeeSort,
  CheckinStats,
  Presence,
  RecentEntry,
  ScanInput,
  ScanResult,
  SyncState,
} from "./schemas";
import { NOT_ATTENDING_LABEL } from "./schemas";

const iso = (at: Date | null | undefined) => at?.toISOString() ?? null;

export const toAttendee = (row: AttendeeRow, repeatScans = 0): Attendee => ({
  id: row.id,
  eventbriteId: row.eventbriteId,
  source: row.source,
  name: row.name,
  email: row.email,
  ticketClass: row.ticketClass,
  status: row.status,
  barcode: row.barcode,
  checkedInAt: iso(row.checkedInAt),
  checkinSource: row.checkinSource ?? null,
  checkinDevice: row.checkinDevice,
  registeredAt: iso(row.registeredAt),
  tags: row.tags,
  repeatScans,
});

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

export const findEvent = (eventId: string) =>
  query((db) =>
    db
      .select({
        id: events.id,
        name: events.name,
        slug: events.slug,
        timezone: events.timezone,
        eventbriteEventId: events.eventbriteEventId,
      })
      .from(events)
      .where(eq(events.id, eventId))
  ).pipe(Effect.flatMap(([event]) => (event ? Effect.succeed(event) : Effect.fail(eventNotFound))));

// ---------------------------------------------------------------------------
// The Eventbrite mirror
// ---------------------------------------------------------------------------

/** How Organizer checked someone in, in the door team's words. */
const METHODS: Record<string, string> = { scan: "Escaneo", search: "Búsqueda" };

/** One Eventbrite attendee as a mirror row. The used barcode's `changed` is when they came in. */
export function mirrorRow(eventId: string, attendee: EventbriteAttendee) {
  const used = attendee.barcodes.find((barcode) => barcode.status === "used");
  const checkedIn = attendee.checked_in || used !== undefined;
  const at = used?.changed ?? attendee.changed;

  return {
    eventId,
    eventbriteId: attendee.id,
    orderId: attendee.order_id ?? null,
    name: attendee.profile.name.trim() || "Sin nombre",
    email: attendee.profile.email.trim(),
    ticketClass: attendee.ticket_class_name,
    status: attendee.refunded ? "refunded" : attendee.cancelled ? "cancelled" : "attending",
    barcode: attendee.barcodes[0]?.barcode ?? null,
    checkedInAt: checkedIn ? (at ? new Date(at) : new Date()) : null,
    checkinSource: checkedIn ? "eventbrite" : null,
    checkinDevice: checkedIn ? (METHODS[used?.checkin_method ?? ""] ?? null) : null,
    registeredAt: new Date(attendee.created),
    changedAt: attendee.changed ? new Date(attendee.changed) : null,
  } satisfies typeof attendees.$inferInsert;
}

const excluded = (column: AnyPgColumn) => sql.raw(`excluded."${column.name}"`);

/**
 * A check-in from OWU's scanner stays: Eventbrite never hears about it, so Eventbrite saying
 * "not checked in" isn't news, and the first entry is the one that counts.
 */
const unlessOwu = (column: AnyPgColumn) =>
  sql`case when ${attendees.checkinSource} = 'owu' then ${column} else ${excluded(column)} end`;

/**
 * Write Eventbrite's attendees into an event's mirror, by Eventbrite id. Rows Eventbrite didn't
 * change are left alone, so the count is what actually changed. Tags are OWU's and never touched.
 */
export const upsertMirror = (eventId: string, people: EventbriteAttendee[]) =>
  Effect.gen(function* () {
    // Pages can shift while they are read; one attendee twice in a statement is an error.
    const rows = [...new Map(people.map((person) => [person.id, mirrorRow(eventId, person)])).values()];
    let changed = 0;
    for (let start = 0; start < rows.length; start += 200) {
      const written = yield* query((db) =>
        db
          .insert(attendees)
          .values(rows.slice(start, start + 200))
          .onConflictDoUpdate({
            target: [attendees.eventId, attendees.eventbriteId],
            set: {
              orderId: excluded(attendees.orderId),
              name: excluded(attendees.name),
              email: excluded(attendees.email),
              ticketClass: excluded(attendees.ticketClass),
              status: excluded(attendees.status),
              barcode: excluded(attendees.barcode),
              registeredAt: excluded(attendees.registeredAt),
              changedAt: excluded(attendees.changedAt),
              checkedInAt: unlessOwu(attendees.checkedInAt),
              checkinSource: unlessOwu(attendees.checkinSource),
              checkinDevice: unlessOwu(attendees.checkinDevice),
            },
            setWhere: sql`${attendees.changedAt} is distinct from ${excluded(attendees.changedAt)} or ${excluded(attendees.changedAt)} is null`,
          })
          .returning({ id: attendees.id })
      );
      changed += written.length;
    }

    return changed;
  });

/** Eventbrite is read at most every 30 s per event, however many screens ask. */
const THROTTLE_MS = 30_000;
/** "Sincronizar ahora" may come sooner, but not in a burst. */
const FORCED_MS = 5_000;

const readSync = (eventId: string) =>
  query((db) => db.select().from(attendeeSync).where(eq(attendeeSync.eventId, eventId))).pipe(
    Effect.map(([row]) => row ?? null)
  );

/**
 * Bring the event's mirror up to date: what changed in Eventbrite since the cursor (everything
 * the first time). Throttled, and a row lock makes a second screen asking at the same moment
 * get the stored state instead of a second read. A failed read is recorded, not thrown: the
 * mirror still has what it had.
 */
export const sync = (eventId: string, force: boolean) =>
  Effect.gen(function* () {
    const event = yield* findEvent(eventId);
    const eventbriteEventId = Eventbrite.eventbriteIdOf(event);
    // Published through a community's own account: its token; otherwise OWU's key
    const token = eventbriteEventId ? yield* tokenForEvent(eventId) : null;
    const missing = !eventbriteEventId ? "event_id" : !token && !Eventbrite.hasApiKey() ? "api_key" : null;
    const state = (outcome: { ran: boolean; changed: number }) =>
      readSync(eventId).pipe(
        Effect.map((row): SyncState => ({
          eventbriteEventId,
          missing,
          syncedAt: iso(row?.syncedAt),
          webhookAt: iso(row?.webhookAt),
          error: row?.error ?? null,
          ...outcome,
        }))
      );
    if (!eventbriteEventId || missing) return yield* state({ ran: false, changed: 0 });

    yield* query((db) => db.insert(attendeeSync).values({ eventId }).onConflictDoNothing());
    const outcome = yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db.select().from(attendeeSync).where(eq(attendeeSync.eventId, eventId)).for("update", { skipLocked: true })
        );
        const wait = force ? FORCED_MS : THROTTLE_MS;
        if (!row || (row.syncedAt && Date.now() - row.syncedAt.getTime() < wait)) return { ran: false, changed: 0 };

        const read = yield* Effect.result(
          Eventbrite.attendeesChangedSince(eventbriteEventId, row.cursor, token ?? undefined)
        );
        if (Result.isFailure(read)) {
          yield* query((db) =>
            db.update(attendeeSync).set({ error: read.failure.message }).where(eq(attendeeSync.eventId, eventId))
          );
          return { ran: true, changed: 0 };
        }

        const changed = yield* upsertMirror(eventId, read.success);
        const cursor = read.success.reduce<Date | null>((newest, person) => {
          const changedAt = person.changed ? new Date(person.changed) : null;
          return changedAt && (!newest || changedAt > newest) ? changedAt : newest;
        }, row.cursor);
        yield* query((db) =>
          db
            .update(attendeeSync)
            .set({ syncedAt: new Date(), cursor, error: null })
            .where(eq(attendeeSync.eventId, eventId))
        );

        return { ran: true, changed };
      })
    );
    if (outcome.changed > 0) yield* opsPing(eventId, "checkins");

    return yield* state(outcome);
  });

/**
 * A webhook from Eventbrite: read what its `api_url` points at and mirror it into every event
 * that mirrors that Eventbrite event. Null when the URL isn't one to follow. A community's own
 * account (`connection`) reads with its token and only reaches that community's events.
 */
export const applyWebhook = (apiUrl: string, connection?: { token: string; communityId: string }) =>
  Effect.gen(function* () {
    const people = yield* Eventbrite.attendeesAt(apiUrl, connection?.token);
    if (!people) return null;

    const fromUrl = /\/events\/([^/]+)\//.exec(new URL(apiUrl).pathname)?.[1] ?? null;
    const byEvent = Map.groupBy(people, (person) => person.event_id ?? fromUrl);
    let changed = 0;
    for (const [eventbriteEventId, group] of byEvent) {
      if (!eventbriteEventId) continue;
      const mirrors = yield* query((db) =>
        db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.eventbriteEventId, eventbriteEventId),
              connection ? eq(events.communityId, connection.communityId) : undefined
            )
          )
      );
      for (const mirror of mirrors) {
        const written = yield* upsertMirror(mirror.id, group);
        yield* query((db) =>
          db
            .insert(attendeeSync)
            .values({ eventId: mirror.id, webhookAt: new Date() })
            .onConflictDoUpdate({ target: attendeeSync.eventId, set: { webhookAt: new Date() } })
        );
        if (written > 0) yield* opsPing(mirror.id, "checkins");
        changed += written;
      }
    }

    return changed;
  });

// ---------------------------------------------------------------------------
// The list: search, tabs, facets, sort, pages, over every attendee
// ---------------------------------------------------------------------------

/** "María" finds "maria" and the other way around. */
export const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const ACCENTED = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
const searchable = sql`translate(lower(${attendees.name} || ' ' || ${attendees.email} || ' ' || coalesce(${attendees.barcode}, '') || ' ' || coalesce(${attendees.eventbriteId}, '')), ${ACCENTED}, ${fold(ACCENTED)})`;

const escapeLike = (word: string) => word.replace(/[\\%_]/g, (char) => `\\${char}`);

/** Every word of `q` in the attendee's name, accents and case aside (the door searches only names). */
export const nameMatches = (q: string) =>
  fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (word) => sql`translate(lower(${attendees.name}), ${ACCENTED}, ${fold(ACCENTED)}) like ${`%${escapeLike(word)}%`}`
    );

const WAITING: AttendeeStatus[] = ["waitlisted", "offered"];
const GONE: AttendeeStatus[] = ["cancelled", "refunded", "declined"];

/**
 * A partition: once someone is in they count as in, whatever happened to their ticket after. The
 * waitlist and the approval queue are their own tabs, never mixed with cancellations.
 */
const PRESENCE: Record<Exclude<Presence, "all">, SQL> = {
  in: isNotNull(attendees.checkedInAt),
  out: and(isNull(attendees.checkedInAt), eq(attendees.status, "attending")) as SQL,
  waiting: and(isNull(attendees.checkedInAt), inArray(attendees.status, WAITING)) as SQL,
  pending: and(isNull(attendees.checkedInAt), eq(attendees.status, "pending")) as SQL,
  cancelled: and(isNull(attendees.checkedInAt), inArray(attendees.status, GONE)) as SQL,
};

const textArray = (values: readonly string[]) =>
  sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )}]::text[]`;

/** The filters as conditions; a facet's own filter is left out of its counts. */
function conditions(filters: AttendeeFilters, skip?: "status" | "ticket" | "tag"): SQL[] {
  const where: SQL[] = [eq(attendees.eventId, filters.eventId)];
  for (const word of fold(filters.q).split(/\s+/).filter(Boolean)) {
    where.push(sql`${searchable} like ${`%${escapeLike(word)}%`}`);
  }
  if (skip !== "status" && filters.status !== "all") where.push(PRESENCE[filters.status]);
  if (skip !== "ticket" && filters.ticket.length > 0) where.push(inArray(attendees.ticketClass, filters.ticket));
  if (skip !== "tag" && filters.tag.length > 0) where.push(sql`${attendees.tags} ?| ${textArray(filters.tag)}`);

  return where;
}

const presenceCounts = (where: SQL[]) =>
  query((db) =>
    db
      .select({
        all: count(),
        in: sql<number>`count(*) filter (where ${PRESENCE.in})`.mapWith(Number),
        out: sql<number>`count(*) filter (where ${PRESENCE.out})`.mapWith(Number),
        waiting: sql<number>`count(*) filter (where ${PRESENCE.waiting})`.mapWith(Number),
        pending: sql<number>`count(*) filter (where ${PRESENCE.pending})`.mapWith(Number),
        cancelled: sql<number>`count(*) filter (where ${PRESENCE.cancelled})`.mapWith(Number),
      })
      .from(attendees)
      .where(and(...where))
  ).pipe(Effect.map(([counts]) => counts ?? { all: 0, in: 0, out: 0, waiting: 0, pending: 0, cancelled: 0 }));

const byName = sql`lower(${attendees.name})`;
const SORTS: Record<AttendeeSort, SQL> = {
  name: sql`${byName} asc`,
  "-name": sql`${byName} desc`,
  checkin: sql`${attendees.checkedInAt} desc nulls last`,
  "-checkin": sql`${attendees.checkedInAt} asc nulls last`,
  registered: sql`${attendees.registeredAt} desc nulls last`,
  "-registered": sql`${attendees.registeredAt} asc nulls last`,
};

const repeatScans =
  sql<number>`(select count(*) from ${attendeeScans} where ${attendeeScans.attendeeId} = ${attendees.id} and ${attendeeScans.result} = 'repeat')`.mapWith(
    Number
  );

const tally = (values: string[]) =>
  [...Map.groupBy(values, (value) => value)]
    .map(([value, group]) => ({ value, count: group.length }))
    .toSorted((a, b) => b.count - a.count || a.value.localeCompare(b.value, "es"));

export const listAttendees = (input: AttendeeListInput) =>
  Effect.gen(function* () {
    const [rows, status, tickets, tagged, totals] = yield* Effect.all(
      [
        query((db) =>
          db
            .select({ row: attendees, repeatScans })
            .from(attendees)
            .where(and(...conditions(input)))
            .orderBy(SORTS[input.sort], byName, asc(attendees.id))
            .limit(input.pageSize)
            .offset((input.page - 1) * input.pageSize)
        ),
        presenceCounts(conditions(input, "status")),
        query((db) =>
          db
            .select({ value: attendees.ticketClass, count: count() })
            .from(attendees)
            .where(and(...conditions(input, "ticket")))
            .groupBy(attendees.ticketClass)
            .orderBy(desc(count()), asc(attendees.ticketClass))
        ),
        query((db) =>
          db
            .select({ tags: attendees.tags })
            .from(attendees)
            .where(and(...conditions(input, "tag")))
        ),
        presenceCounts([eq(attendees.eventId, input.eventId)]),
      ],
      { concurrency: "unbounded" }
    );

    return {
      rows: rows.map(({ row, repeatScans: repeats }) => toAttendee(row, repeats)),
      page: input.page,
      pageSize: input.pageSize,
      facets: { status, tickets, tags: tally(tagged.flatMap((row) => row.tags)) },
      totals,
    } satisfies AttendeeList;
  });

/** Add and remove tags on some attendees of the event; how many were touched. */
export const setTags = (input: { eventId: string; ids: string[]; add: string[]; remove: string[] }) =>
  Effect.gen(function* () {
    const touched = yield* transaction(
      Effect.gen(function* () {
        const rows = yield* query((db) =>
          db
            .update(attendees)
            .set({
              tags: sql`coalesce((
                select jsonb_agg(value order by value)
                from (select jsonb_array_elements_text(${attendees.tags}) as value union select unnest(${textArray(input.add)})) as tagged
                where value <> all(${textArray(input.remove)})
              ), '[]'::jsonb)`,
            })
            .where(and(eq(attendees.eventId, input.eventId), inArray(attendees.id, input.ids)))
            .returning({ id: attendees.id })
        );
        if (rows.length === 0) return 0;

        const people = rows.length === 1 ? "1 asistente" : `${rows.length} asistentes`;
        const parts = [
          input.add.length ? `etiquetó a ${people} con ${input.add.map((tag) => `«${tag}»`).join(", ")}` : null,
          input.remove.length
            ? `${input.add.length ? "y les sacó" : `le sacó a ${people}`} ${input.remove.map((tag) => `«${tag}»`).join(", ")}`
            : null,
        ];
        yield* recordActivity({
          eventId: input.eventId,
          verb: "attendees.tagged",
          entityType: "attendee",
          entityId: rows.length === 1 ? rows[0].id : null,
          summary: parts.filter(Boolean).join(" "),
        });

        return rows.length;
      })
    );
    if (touched > 0) yield* opsPing(input.eventId, "checkins");

    return { count: touched };
  });

const PRESENCE_WORDS = { in: "Acreditado", out: "Por llegar" } as const;

/** One CSV cell: quoted when it has to be, and never read as a formula by a spreadsheet. */
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",;\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The attendees the filters (or the selection) pick, as a CSV with a BOM so Excel reads the accents. */
export const exportAttendees = (input: AttendeeFilters & { ids?: string[] }) =>
  Effect.gen(function* () {
    const event = yield* findEvent(input.eventId);
    const where = conditions(input);
    if (input.ids) where.push(input.ids.length > 0 ? inArray(attendees.id, input.ids) : sql`false`);
    const rows = yield* query((db) =>
      db
        .select()
        .from(attendees)
        .where(and(...where))
        .orderBy(byName, asc(attendees.id))
    );
    const clock = new Intl.DateTimeFormat("sv-SE", {
      timeZone: event.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const lines = [
      ["Nombre", "Email", "Entrada", "Estado", "Acreditación", "Etiquetas"],
      ...rows.map((row) => [
        row.name,
        row.email,
        row.ticketClass,
        row.checkedInAt
          ? PRESENCE_WORDS.in
          : row.status === "attending"
            ? PRESENCE_WORDS.out
            : NOT_ATTENDING_LABEL[row.status],
        row.checkedInAt ? clock.format(row.checkedInAt) : "",
        row.tags.join(", "),
      ]),
    ];

    return {
      filename: `asistentes-${event.slug}.csv`,
      csv: `﻿${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`,
      count: rows.length,
    };
  });

// ---------------------------------------------------------------------------
// The door: arrivals, the recent feed, OWU's own scanner
// ---------------------------------------------------------------------------

const FIVE_MIN = 5 * 60_000;
const QUARTER = 15 * 60_000;
const DAY = 24 * 60 * 60_000;

/** The arrival curve (per 5 minutes), the last quarter hour, the busiest one, and every door's count. */
export const checkinStats = (eventId: string, since?: string) =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select({ at: attendees.checkedInAt, device: attendees.checkinDevice, source: attendees.checkinSource })
        .from(attendees)
        .where(and(eq(attendees.eventId, eventId), isNotNull(attendees.checkedInAt)))
    );
    const now = Date.now();
    const start = Math.max(now - DAY, since ? Date.parse(since) : now - 55 * 60_000);
    const from = Math.floor(start / FIVE_MIN) * FIVE_MIN;
    const buckets = Array.from({ length: Math.floor((now - from) / FIVE_MIN) + 1 }, (_, index) => ({
      at: from + index * FIVE_MIN,
      count: 0,
    }));
    const quarters = new Map<number, number>();
    let last15 = 0;
    for (const { at } of rows) {
      const time = at?.getTime() ?? 0;
      const bucket = buckets[Math.floor((time - from) / FIVE_MIN)];
      if (bucket && time >= from) bucket.count += 1;
      if (time > now - QUARTER && time <= now) last15 += 1;
      const quarter = Math.floor(time / QUARTER) * QUARTER;
      quarters.set(quarter, (quarters.get(quarter) ?? 0) + 1);
    }
    const busiest = [...quarters].reduce<[number, number] | null>(
      (best, entry) => (!best || entry[1] > best[1] ? entry : best),
      null
    );
    const doors = Map.groupBy(rows, (row) => `${row.source ?? "eventbrite"}|${row.device ?? ""}`);

    return {
      buckets: buckets.map((bucket) => ({ at: new Date(bucket.at).toISOString(), count: bucket.count })),
      last15,
      peak: busiest ? { at: new Date(busiest[0]).toISOString(), count: busiest[1] } : null,
      doors: [...doors]
        .map(([key, group]) => {
          const [source, device] = key.split("|") as ["eventbrite" | "owu", string];
          return { source, device: device || (source === "owu" ? "Escáner OWU" : "Organizer"), count: group.length };
        })
        .toSorted((a, b) => b.count - a.count),
    } satisfies CheckinStats;
  });

/** The latest arrivals, with the scans that let nobody in (a ticket read twice, an unknown code). */
export const recentCheckins = (eventId: string, limit: number) =>
  Effect.gen(function* () {
    const [arrivals, refused] = yield* Effect.all(
      [
        query((db) =>
          db
            .select({
              id: attendees.id,
              name: attendees.name,
              ticketClass: attendees.ticketClass,
              at: attendees.checkedInAt,
              device: attendees.checkinDevice,
              source: attendees.checkinSource,
            })
            .from(attendees)
            .where(and(eq(attendees.eventId, eventId), isNotNull(attendees.checkedInAt)))
            .orderBy(desc(attendees.checkedInAt))
            .limit(limit)
        ),
        query((db) =>
          db
            .select({
              id: attendeeScans.id,
              result: attendeeScans.result,
              code: attendeeScans.code,
              device: attendeeScans.device,
              at: attendeeScans.scannedAt,
              name: attendees.name,
              ticketClass: attendees.ticketClass,
              firstAt: attendees.checkedInAt,
            })
            .from(attendeeScans)
            .leftJoin(attendees, eq(attendees.id, attendeeScans.attendeeId))
            .where(and(eq(attendeeScans.eventId, eventId), ne(attendeeScans.result, "ok")))
            .orderBy(desc(attendeeScans.scannedAt))
            .limit(limit)
        ),
      ],
      { concurrency: "unbounded" }
    );

    const entries: RecentEntry[] = [
      ...arrivals.map((row) => ({
        id: `in:${row.id}`,
        kind: "in" as const,
        at: iso(row.at) ?? "",
        name: row.name,
        ticketClass: row.ticketClass,
        device: row.device,
        source: row.source ?? null,
        firstAt: null,
        code: null,
      })),
      ...refused.flatMap(({ result, ...row }) =>
        result === "ok"
          ? []
          : [
              {
                id: `scan:${row.id}`,
                kind: result,
                at: row.at.toISOString(),
                name: row.name,
                ticketClass: row.ticketClass,
                device: row.device || null,
                source: "owu" as const,
                firstAt: iso(row.firstAt),
                code: result === "unknown" ? row.code : null,
              },
            ]
      ),
    ];

    return entries.toSorted((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  });

const scanAttendee = (row: AttendeeRow | null): ScanResult["attendee"] =>
  row
    ? {
        id: row.id,
        name: row.name,
        ticketClass: row.ticketClass,
        status: row.status,
        checkedInAt: iso(row.checkedInAt),
        checkinSource: row.checkinSource ?? null,
        checkinDevice: row.checkinDevice,
      }
    : null;

const scanByNonce = (nonce: string) =>
  query((db) =>
    db
      .select({ scan: attendeeScans, attendee: attendees })
      .from(attendeeScans)
      .leftJoin(attendees, eq(attendees.id, attendeeScans.attendeeId))
      .where(eq(attendeeScans.nonce, nonce))
  ).pipe(Effect.map(([row]) => row ?? null));

/** A nonce seen before gets the answer it got the first time; nothing is counted again. */
const replay = (eventId: string, nonce: string) =>
  scanByNonce(nonce).pipe(
    Effect.flatMap((row) =>
      !row
        ? Effect.die(new Error("A scan that collided on its nonce is gone"))
        : row.scan.eventId !== eventId
          ? Effect.fail(new Invalid({ message: "Ese escaneo es de otro evento" }))
          : Effect.succeed<ScanResult>({
              result: row.scan.result,
              replayed: true,
              scannedAt: row.scan.scannedAt.toISOString(),
              attendee: scanAttendee(row.attendee),
            })
    )
  );

/** A queued scan keeps the time it happened, but a phone's clock can't put it in the future or days back. */
const scanTime = (scannedAt?: string) => {
  const now = Date.now();
  return new Date(Math.min(now, Math.max(now - DAY, scannedAt ? Date.parse(scannedAt) : now)));
};

/**
 * OWU's scanner at the door. The first valid scan of a ticket checks the person in (here only:
 * Eventbrite can't be told); later ones are repeats; every scan is kept. Idempotent by nonce,
 * and the attendee row is locked, so two phones reading one ticket at once let one person in.
 */
export const scan = (input: ScanInput) =>
  Effect.gen(function* () {
    if (yield* scanByNonce(input.nonce)) return yield* replay(input.eventId, input.nonce);
    // Staff and members scan signed in; a volunteer's door link has no account behind it
    const me = Option.getOrNull(yield* Effect.serviceOption(CurrentUser));
    const scannedAt = scanTime(input.scannedAt);
    const device = input.device || "Escáner OWU";

    const outcome = yield* transaction(
      Effect.gen(function* () {
        const [found] = yield* query((db) =>
          db
            .select()
            .from(attendees)
            .where(
              and(
                eq(attendees.eventId, input.eventId),
                or(eq(attendees.barcode, input.code), eq(attendees.eventbriteId, input.code))
              )
            )
            .limit(1)
            .for("update")
        );
        const result: ScanResult["result"] = !found
          ? "unknown"
          : found.status !== "attending"
            ? "cancelled"
            : found.checkedInAt
              ? "repeat"
              : "ok";
        const [admitted] =
          result === "ok" && found
            ? yield* query((db) =>
                db
                  .update(attendees)
                  .set({ checkedInAt: scannedAt, checkinSource: "owu", checkinDevice: device })
                  .where(eq(attendees.id, found.id))
                  .returning()
              )
            : [found ?? null];
        yield* query((db) =>
          db.insert(attendeeScans).values({
            eventId: input.eventId,
            attendeeId: found?.id ?? null,
            code: input.code,
            result,
            device,
            userId: me?.id ?? null,
            nonce: input.nonce,
            scannedAt,
          })
        );

        return { result, replayed: false, scannedAt: scannedAt.toISOString(), attendee: scanAttendee(admitted) };
      })
    );
    yield* opsPing(input.eventId, "checkins");

    return outcome satisfies ScanResult;
  }).pipe(
    // The same nonce sent twice at once (a replay racing the original): the second one reads the first.
    Effect.catchTag("UniqueViolation", () => replay(input.eventId, input.nonce))
  );
