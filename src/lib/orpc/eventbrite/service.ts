import { Effect } from "effect";
import type * as z from "zod";

import { EVENTBRITE_API_KEY, EVENTBRITE_API_URL, EVENTBRITE_EVENT_ID } from "app/lib/constants";

import type { UpstreamFailed } from "../errors";
import { fetchJson } from "../http";
import { AttendeesPageSchema, EventbriteEventSchema, type Attendee, type Summary } from "./schemas";

/** Eventbrite is optional: without a key and an event, there is simply nothing to show. */
const isConfigured = () => Boolean(EVENTBRITE_API_KEY && EVENTBRITE_EVENT_ID);

const get = <S extends z.ZodType>(path: string, schema: S, revalidate: number) =>
  fetchJson("Eventbrite", `${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}${path}`, schema, {
    headers: { Authorization: `Bearer ${EVENTBRITE_API_KEY}` },
    next: { revalidate },
  });

const attendeesPage = (page: number, pageSize: number, status?: string) => {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (status) params.set("status", status);

  return get(`/attendees/?${params}`, AttendeesPageSchema, 60);
};

/** One page of attendees, or null when Eventbrite isn't set up. */
export const listAttendees = (input: { page: number; pageSize: number; status?: string }) =>
  isConfigured() ? attendeesPage(input.page, input.pageSize, input.status) : Effect.succeed(null);

/** Every attendee: the first page says how many pages there are, the rest load a few at a time. */
export const everyAttendee: Effect.Effect<Attendee[], UpstreamFailed> = Effect.gen(function* () {
  const first = yield* attendeesPage(1, 100);
  const rest = yield* Effect.forEach(
    Array.from({ length: Math.max(0, first.pagination.page_count - 1) }, (_, index) => index + 2),
    (page) => attendeesPage(page, 100),
    { concurrency: 4 }
  );

  return [first, ...rest].flatMap((page) => page.attendees);
});

/** The event and its attendance across every page, or null when Eventbrite isn't set up. */
export const getSummary = (): Effect.Effect<Summary | null, UpstreamFailed> =>
  isConfigured()
    ? Effect.gen(function* () {
        const [event, attendees] = yield* Effect.all([get("/", EventbriteEventSchema, 300), everyAttendee], {
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
