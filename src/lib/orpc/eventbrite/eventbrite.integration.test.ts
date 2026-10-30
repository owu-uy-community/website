import { call } from "@orpc/server";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeSiteAdmin, makeUser } from "test/factories";
import { server } from "test/msw/server";

// The Eventbrite constants are read when lib/orpc imports them, so they must be set first.
vi.hoisted(() => {
  process.env.EVENTBRITE_API_KEY = "eventbrite-test-key";
  process.env.NEXT_PUBLIC_EVENTBRITE_EVENT_ID = "4242";
});

const API = "https://www.eventbriteapi.com/v3/events/4242";

const attendee = (id: number, checkedIn: boolean) => ({
  id: String(id),
  created: "2026-10-01T12:00:00Z",
  ticket_class_name: "General",
  checked_in: checkedIn,
  cancelled: false,
  refunded: false,
  profile: { name: `Persona ${id}`, email: `p${id}@test.owu.uy` },
});

/** Eventbrite's answer to a query parameter an endpoint doesn't take. */
const unknownParameter = (name: string) =>
  HttpResponse.json(
    {
      error: "ARGUMENTS_ERROR",
      error_description: `There are errors with your arguments: ${name} - Unknown parameter`,
    },
    { status: 400 }
  );

/** 150 attendees over two pages: 10 checked in on the first page, 30 on the second. */
function mockEventbrite() {
  server.use(
    http.get(`${API}/`, () =>
      HttpResponse.json({
        id: "4242",
        name: { text: "OWU Conf 2026" },
        start: { local: "2026-11-07T14:30:00" },
        end: { local: "2026-11-07T20:30:00" },
        capacity: 300,
        status: "live",
      })
    ),
    http.get(`${API}/attendees/`, ({ request }) => {
      // Like Eventbrite: its attendee pages have a fixed size.
      if (new URL(request.url).searchParams.has("page_size")) return unknownParameter("page_size");
      const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
      const attendees =
        page === 1
          ? Array.from({ length: 100 }, (_, i) => attendee(i, i < 10))
          : Array.from({ length: 50 }, (_, i) => attendee(100 + i, i < 30));

      return HttpResponse.json({
        attendees,
        pagination: { object_count: 150, page_number: page, page_size: 100, page_count: 2, has_more_items: page === 1 },
      });
    })
  );
}

describe("eventbrite", () => {
  test("the summary is staff-only", async () => {
    mockEventbrite();
    const user = await makeUser();

    await expect(call(router.eventbrite.getSummary, undefined, by(user))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.eventbrite.getSummary, undefined, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("the summary reports the event and the total sold", async () => {
    mockEventbrite();
    const staff = await makeSiteAdmin();

    const summary = await call(router.eventbrite.getSummary, undefined, by(staff));

    expect(summary).toMatchObject({
      event: { name: "OWU Conf 2026", capacity: 300 },
      summary: { total_attendees: 150 },
    });
  });

  test("#8 check-ins are counted across every attendee page", async () => {
    mockEventbrite();
    const staff = await makeSiteAdmin();

    const summary = await call(router.eventbrite.getSummary, undefined, by(staff));

    expect(summary?.summary.checked_in).toBe(40);
  });

  test("#12 an Eventbrite outage is a BAD_GATEWAY, not a crash", async () => {
    mockEventbrite();
    server.use(http.get(`${API}/attendees/`, () => HttpResponse.json({ error_description: "down" }, { status: 503 })));
    const staff = await makeSiteAdmin();

    await expect(call(router.eventbrite.getSummary, undefined, by(staff))).rejects.toMatchObject({
      code: "BAD_GATEWAY",
    });
  });

  test("the env's event stays the bot's: an event without its own id mirrors nothing", async () => {
    mockEventbrite();
    const event = await makeEvent((await makeCommunity()).id);

    await expect(call(router.attendees.sync, { eventId: event.id }, by(await makeSiteAdmin()))).resolves.toMatchObject({
      missing: "event_id",
      ran: false,
    });
  });
});
