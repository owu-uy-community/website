import { Effect } from "effect";
import type * as z from "zod";

import { EVENTBRITE_API_KEY, EVENTBRITE_API_URL, EVENTBRITE_EVENT_ID } from "app/lib/constants";

import { UpstreamFailed } from "../errors";
import { fetchJson } from "../http";
import {
  AttendeeSchema,
  AttendeesPageSchema,
  EventbriteEventSchema,
  OrderSchema,
  type Attendee,
  type Summary,
} from "./schemas";

/** Eventbrite is optional: without a key and an event, there is simply nothing to show. */
export const isConfigured = () => Boolean(EVENTBRITE_API_KEY && EVENTBRITE_EVENT_ID);

export const hasApiKey = () => Boolean(EVENTBRITE_API_KEY);

/**
 * The Eventbrite event an OWU event mirrors: only its own id. The env's event is the Owy bot's
 * summary; falling back to it would copy one event's attendees into every other event's list.
 */
export const eventbriteIdOf = (event: { eventbriteEventId: string | null }) => event.eventbriteEventId || null;

const authorization = (token = EVENTBRITE_API_KEY) => ({ Authorization: `Bearer ${token}` });

const get = <S extends z.ZodType>(path: string, schema: S, revalidate: number) =>
  fetchJson("Eventbrite", `${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}${path}`, schema, {
    headers: authorization(),
    next: { revalidate },
  });

/** What went wrong, in words the person at the door can act on. */
function explain(error: UpstreamFailed): UpstreamFailed {
  const status = Number(/answered (\d{3})/.exec(error.cause instanceof Error ? error.cause.message : "")?.[1]);
  const message =
    status === 401
      ? "Eventbrite rechazó la clave de la API (EVENTBRITE_API_KEY)"
      : // A valid key whose account isn't in the event's organization: the event reads, its attendees don't.
        status === 403
        ? "La clave de Eventbrite es de una cuenta que no está en la organización del evento: no puede ver sus asistentes"
        : status === 404
          ? "Eventbrite no encuentra ese evento: revisá su ID en los ajustes del evento"
          : status === 429
            ? "Eventbrite pide que esperemos un poco antes de volver a leer"
            : status
              ? `Eventbrite respondió ${status}`
              : "Eventbrite no responde";

  return new UpstreamFailed({ service: "Eventbrite", message, cause: error.cause });
}

/**
 * A fresh read, never cached: the mirror and the webhook need what Eventbrite has right now. The
 * token is a community's connected account, or OWU's own key.
 */
const live = <S extends z.ZodType>(url: string, schema: S, token?: string) =>
  fetchJson("Eventbrite", url, schema, { headers: authorization(token), cache: "no-store" }).pipe(
    Effect.mapError(explain)
  );

/** The ticketed event itself (name, dates, capacity). */
export const getEvent = () => get("/", EventbriteEventSchema, 300);

// Attendee pages have a fixed size: Eventbrite answers `page_size` with a 400 ("Unknown parameter").
const attendeesPage = (page: number) => get(`/attendees/?page=${page}`, AttendeesPageSchema, 60);

/** Every attendee: the first page says how many pages there are, the rest load a few at a time. */
export const everyAttendee: Effect.Effect<Attendee[], UpstreamFailed> = Effect.gen(function* () {
  const first = yield* attendeesPage(1);
  const rest = yield* Effect.forEach(
    Array.from({ length: Math.max(0, first.pagination.page_count - 1) }, (_, index) => index + 2),
    (page) => attendeesPage(page),
    { concurrency: 4 }
  );

  return [first, ...rest].flatMap((page) => page.attendees);
});

/** The event and its attendance across every page, or null when Eventbrite isn't set up. */
export const getSummary = (): Effect.Effect<Summary | null, UpstreamFailed> =>
  isConfigured()
    ? Effect.gen(function* () {
        const [event, attendees] = yield* Effect.all([getEvent(), everyAttendee], {
          concurrency: "unbounded",
        });
        const active = attendees.filter((attendee) => !attendee.cancelled && !attendee.refunded);

        return {
          event: {
            id: event.id,
            name: event.name.text,
            start: event.start.local,
            end: event.end.local,
            capacity: event.capacity ?? null,
            status: event.status,
          },
          summary: {
            total_attendees: attendees.length,
            checked_in: attendees.filter((attendee) => attendee.checked_in).length,
            not_checked_in: active.filter((attendee) => !attendee.checked_in).length,
            cancelled: attendees.filter((attendee) => attendee.cancelled).length,
            refunded: attendees.filter((attendee) => attendee.refunded).length,
          },
        };
      })
    : Effect.succeed(null);

// ponytail: 100 pages of 50 is 5,000 attendees; past that a first read has to resume from a saved continuation.
const MAX_PAGES = 100;

/** Eventbrite's `changed_since` takes whole seconds in UTC. */
export const eventbriteTime = (at: Date) => at.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Every attendee of an Eventbrite event that changed on or after `since` (all of them without
 * it), page by page. Pages chain through the continuation token when Eventbrite sends one.
 */
export const attendeesChangedSince = (eventbriteEventId: string, since: Date | null, token?: string) =>
  Effect.gen(function* () {
    const read: Attendee[] = [];
    let next: Record<string, string> = {};
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({ ...next, ...(since ? { changed_since: eventbriteTime(since) } : {}) });
      const response = yield* live(
        `${EVENTBRITE_API_URL}/events/${encodeURIComponent(eventbriteEventId)}/attendees/?${params}`,
        AttendeesPageSchema,
        token
      );
      read.push(...response.attendees);
      if (!response.pagination.has_more_items) break;
      next = response.pagination.continuation
        ? { continuation: response.pagination.continuation }
        : { page: String(response.pagination.page_number + 1) };
    }

    return read;
  });

const API_ORIGIN = new URL(EVENTBRITE_API_URL).origin;

/**
 * The attendees a webhook's `api_url` points at: one attendee, or every attendee of an order.
 * Only Eventbrite's own API is ever followed, since our key goes along with the request;
 * anything else is `null`.
 */
export const attendeesAt = (apiUrl: string, token?: string): Effect.Effect<Attendee[] | null, UpstreamFailed> => {
  const url = URL.canParse(apiUrl) ? new URL(apiUrl) : null;
  if (!url || url.origin !== API_ORIGIN || url.username || url.password) return Effect.succeed(null);

  if (/^\/v3\/events\/[^/]+\/attendees\/[^/]+\/?$/.test(url.pathname)) {
    return live(url.toString(), AttendeeSchema, token).pipe(Effect.map((attendee) => [attendee]));
  }
  if (/^\/v3\/orders\/[^/]+\/?$/.test(url.pathname)) {
    url.searchParams.set("expand", "attendees");
    return live(url.toString(), OrderSchema, token).pipe(Effect.map((order) => order.attendees));
  }

  return Effect.succeed(null);
};
