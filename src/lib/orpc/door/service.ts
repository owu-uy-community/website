import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import { dayKey, montevideoIso } from "../../community/time";
import { attendees, communities, events, type EventRow } from "../../db/schema";
import { appUrl } from "../../email/templates";
import { readLink, signLink } from "../../links";
import { ticketCode } from "../../organizar/ticket";
import { ListAttendeesSchema } from "../attendees/schemas";
import * as Attendees from "../attendees/service";
import { query } from "../db";
import { Conflict, NotFound } from "../errors";
import { opsPing, recordActivity } from "../ops";
import { CommunityScope } from "../services";
import type { ScanInput } from "../attendees/schemas";

const expired = new NotFound({
  entity: "door",
  message: "Este link de la puerta ya no sirve: pedile uno nuevo a quien organiza",
});

/** A door link lasts until the night of the event (or six hours after it ends, if later). */
const expiryOf = (event: Pick<EventRow, "startDate" | "endDate">) =>
  new Date(
    Math.max(Date.parse(montevideoIso(`${dayKey(event.startDate)}T23:59`)), event.endDate.getTime() + 6 * 3_600_000)
  );

/** The event a door link opens, if it's still valid: not expired, not revoked, still published. */
const eventOf = (token: string) =>
  Effect.gen(function* () {
    const value = yield* Effect.promise(() => readLink("door", token));
    const [eventId, version] = value?.split(".") ?? [];
    if (!eventId) return yield* expired;
    const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, eventId)));
    if (!event || String(event.doorVersion) !== version || event.status !== "published") return yield* expired;

    return event;
  });

/** A link for the volunteers at the door: no account, valid until the night of the event. */
export const link = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, eventId)));
    if (!event || event.communityId !== communityId) return yield* expired;
    const expiresAt = expiryOf(event);
    const token = yield* Effect.promise(() => signLink("door", `${event.id}.${event.doorVersion}`, expiresAt));

    return { url: appUrl(`/puerta/${token}`), expiresAt: expiresAt.toISOString() };
  });

/** Every door link handed out stops working (a new one can be made right after). */
export const revoke = (eventId: string) =>
  Effect.gen(function* () {
    const { communityId } = yield* CommunityScope;
    const [event] = yield* query((db) => db.select().from(events).where(eq(events.id, eventId)));
    if (!event || event.communityId !== communityId) return yield* expired;
    yield* query((db) =>
      db
        .update(events)
        .set({ doorVersion: event.doorVersion + 1, updatedAt: event.updatedAt })
        .where(eq(events.id, eventId))
    );
    yield* recordActivity({
      eventId,
      verb: "door.revoked",
      entityType: "event",
      entityId: eventId,
      summary: "anuló los links de la puerta",
    });

    return { ok: true as const };
  });

const totals = (eventId: string) =>
  Attendees.listAttendees(ListAttendeesSchema.parse({ eventId, pageSize: 10 })).pipe(
    Effect.map(({ totals: all }) => ({ all: all.all, in: all.in, out: all.out }))
  );

export const info = (token: string) =>
  Effect.gen(function* () {
    const event = yield* eventOf(token);
    const [community] = yield* query((db) =>
      db.select({ name: communities.name }).from(communities).where(eq(communities.id, event.communityId))
    );

    return {
      eventId: event.id,
      name: event.name,
      timezone: event.timezone,
      communityName: community?.name ?? "",
      expiresAt: expiryOf(event).toISOString(),
      totals: yield* totals(event.id),
    };
  });

export const counts = (token: string) =>
  eventOf(token).pipe(
    Effect.flatMap((event) => totals(event.id)),
    Effect.map((all) => ({ totals: all }))
  );

/** Where a door reference ("id:<attendee>") points: a ticket code the volunteer never sees */
const REFERENCE = "id:";
/** Walk-ins an event can take from door links: a link can't flood the list */
const MAX_WALK_INS = 300;

/**
 * Find someone by name at the door, among the people signed up. Names and tickets only: no
 * emails, no codes (a match carries an opaque reference the server turns into the ticket).
 */
export const search = (token: string, q: string) =>
  Effect.gen(function* () {
    const event = yield* eventOf(token);
    const conditions = Attendees.nameMatches(q);
    if (conditions.length === 0) return { rows: [] };
    const rows = yield* query((db) =>
      db
        .select()
        .from(attendees)
        .where(and(eq(attendees.eventId, event.id), eq(attendees.status, "attending"), ...conditions))
        .orderBy(attendees.name)
        .limit(10)
    );

    return {
      rows: rows.map((row) => ({
        ...Attendees.toAttendee(row),
        email: "",
        eventbriteId: null,
        barcode: `${REFERENCE}${row.id}`,
        tags: [],
      })),
    };
  });

/** A scan from the door: a QR's ticket code, or a search match's reference resolved here. */
export const scan = (token: string, input: Omit<ScanInput, "eventId">) =>
  Effect.gen(function* () {
    const event = yield* eventOf(token);
    let code = input.code;
    if (code.startsWith(REFERENCE)) {
      const [row] = yield* query((db) =>
        db
          .select({ barcode: attendees.barcode, eventbriteId: attendees.eventbriteId })
          .from(attendees)
          .where(and(eq(attendees.id, code.slice(REFERENCE.length)), eq(attendees.eventId, event.id)))
      );
      code = row?.barcode ?? row?.eventbriteId ?? code;
    }

    return yield* Attendees.scan({ ...input, code, eventId: event.id, device: input.device || "Puerta (link)" });
  });

/** Someone who came without signing up: in, and counted. Name only: nothing gets mailed to them. */
export const walkIn = (token: string, input: { name: string }) =>
  Effect.gen(function* () {
    const event = yield* eventOf(token);
    const [{ walkIns }] = yield* query((db) =>
      db
        .select({ walkIns: sql<number>`count(*)`.mapWith(Number) })
        .from(attendees)
        .where(and(eq(attendees.eventId, event.id), eq(attendees.ticketClass, "En la puerta")))
    );
    if (walkIns >= MAX_WALK_INS) {
      return yield* new Conflict({
        reason: "too_many",
        message: "Llegaron muchas altas en la puerta: avisale a quien organiza",
      });
    }
    const now = new Date();
    const [row] = yield* query((db) =>
      db
        .insert(attendees)
        .values({
          eventId: event.id,
          source: "owu",
          name: input.name,
          email: "",
          ticketClass: "En la puerta",
          barcode: ticketCode(),
          status: "attending",
          registeredAt: now,
          checkedInAt: now,
          checkinSource: "owu",
          checkinDevice: "Alta en la puerta",
        })
        .returning({ id: attendees.id, name: attendees.name })
    );
    yield* opsPing(event.id, "checkins");

    return row;
  });
