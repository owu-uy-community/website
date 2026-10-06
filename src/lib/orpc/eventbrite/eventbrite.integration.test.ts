import { call } from "@orpc/server";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeSiteAdmin, makeUser } from "test/factories";
import { server } from "test/msw/server";

// The Eventbrite constants are read when lib/orpc imports them, so they must be set first.
vi.hoisted(() => {
  process.env.EVENTBRITE_API_KEY = "eventbrite-test-key";
  process.env.NEXT_PUBLIC_EVENTBRITE_EVENT_ID = "4242";
});

const API = "https://www.eventbriteapi.com/v3/events/4242";

const attendee = (id: number, checkedIn: boolean) => ({
  id: String(id),
  checked_in: checkedIn,
  cancelled: false,
  refunded: false,
  profile: { name: `Persona ${id}`, email: `p${id}@test.owu.uy` },
});

/** 150 attendees over two pages: 10 checked in on the first page, 30 on the second. */
function mockEventbrite() {
  const requests: URL[] = [];
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
      const url = new URL(request.url);
      requests.push(url);
      const page = Number(url.searchParams.get("page") ?? "1");
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

  return { requests };
}

describe("eventbrite", () => {
  test("staff pages through attendees with the page and size they ask for", async () => {
    const { requests } = mockEventbrite();
    const staff = await makeSiteAdmin();

    const result = await call(router.eventbrite.getAttendees, { page: 2, pageSize: 100 }, by(staff));

    expect(result?.attendees).toHaveLength(50);
    expect(requests.map((url) => [url.searchParams.get("page"), url.searchParams.get("page_size")])).toStrictEqual([
      ["2", "100"],
    ]);
  });

  test("the attendee list is staff-only", async () => {
    mockEventbrite();
    const user = await makeUser();

    await expect(call(router.eventbrite.getAttendees, {}, by(user))).rejects.toMatchObject({ code: "FORBIDDEN" });
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

  test.fails("#8 check-ins are counted across every attendee page", async () => {
    mockEventbrite();
    const staff = await makeSiteAdmin();

    const summary = await call(router.eventbrite.getSummary, undefined, by(staff));

    expect(summary?.summary.checked_in).toBe(40);
  });

  test.fails("#12 an Eventbrite outage is a BAD_GATEWAY, not a crash", async () => {
    server.use(http.get(`${API}/attendees/`, () => HttpResponse.json({ error_description: "down" }, { status: 503 })));
    const staff = await makeSiteAdmin();

    await expect(call(router.eventbrite.getAttendees, {}, by(staff))).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });
});
