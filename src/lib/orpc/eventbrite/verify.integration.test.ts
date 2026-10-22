import { call } from "@orpc/server";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeMember, makeSiteAdmin } from "test/factories";
import { server } from "test/msw/server";

const ID = "1734092841203";
const API = `https://www.eventbriteapi.com/v3/events/${ID}`;

/** The event, and its active tickets counted by Eventbrite. */
function mockEventbrite() {
  const requests: Request[] = [];
  server.use(
    http.get(`${API}/`, ({ request }) => {
      requests.push(request);
      return HttpResponse.json({
        id: ID,
        name: { text: "OWU CONF 2026" },
        start: { local: "2026-11-07T14:30:00" },
        end: { local: "2026-11-07T21:30:00" },
        capacity: 480,
        status: "live",
      });
    }),
    http.get(`${API}/attendees/`, ({ request }) => {
      requests.push(request);
      // Like Eventbrite: attendee pages have a fixed size, and `page_size` is a 400.
      if (new URL(request.url).searchParams.has("page_size")) {
        return HttpResponse.json(
          { error: "ARGUMENTS_ERROR", error_description: "page_size - Unknown parameter" },
          { status: 400 }
        );
      }
      return HttpResponse.json({
        attendees: [],
        pagination: { object_count: 450, page_number: 1, page_size: 50, page_count: 9, has_more_items: true },
      });
    })
  );

  return { requests };
}

describe("eventbrite.verify", () => {
  beforeEach(() => {
    vi.stubEnv("EVENTBRITE_API_KEY", "eventbrite-test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("finds the event by id and counts its active tickets", async () => {
    const { requests } = mockEventbrite();
    const staff = await makeSiteAdmin();

    const found = await call(router.eventbrite.verify, { eventbriteEventId: ID }, by(staff));

    expect(found).toStrictEqual({
      id: ID,
      name: "OWU CONF 2026",
      start: "2026-11-07T14:30:00",
      status: "live",
      tickets: 450,
    });
    const attendees = new URL(requests.find((request) => request.url.includes("/attendees/"))!.url);
    expect(attendees.searchParams.get("status")).toBe("attending");
    expect(requests.every((request) => request.headers.get("authorization") === "Bearer eventbrite-test-key")).toBe(
      true
    );
  });

  test("an id Eventbrite doesn't know is a NOT_FOUND with a message for the form", async () => {
    server.use(http.get(`${API}/`, () => HttpResponse.json({ error: "NOT_FOUND" }, { status: 404 })));
    server.use(http.get(`${API}/attendees/`, () => HttpResponse.json({ error: "NOT_FOUND" }, { status: 404 })));
    const staff = await makeSiteAdmin();

    await expect(call(router.eventbrite.verify, { eventbriteEventId: ID }, by(staff))).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Eventbrite no tiene ningún evento con ese número",
    });
  });

  test("a key from outside the event's organization says so, apart from a wrong key", async () => {
    // Like Eventbrite: the event itself reads; its attendees answer 403.
    const { requests } = mockEventbrite();
    server.use(http.get(`${API}/attendees/`, () => HttpResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 })));
    const staff = await makeSiteAdmin();

    await expect(call(router.eventbrite.verify, { eventbriteEventId: ID }, by(staff))).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: expect.stringContaining("no está en la organización de ese evento"),
    });
    expect(requests.some((request) => request.url.endsWith(`/events/${ID}/`))).toBe(true);

    server.use(
      http.get(`${API}/`, () => HttpResponse.json({ error: "INVALID_AUTH" }, { status: 401 })),
      http.get(`${API}/attendees/`, () => HttpResponse.json({ error: "INVALID_AUTH" }, { status: 401 }))
    );
    await expect(call(router.eventbrite.verify, { eventbriteEventId: ID }, by(staff))).rejects.toMatchObject({
      message: "Eventbrite rechazó la clave de la API (EVENTBRITE_API_KEY)",
    });
  });

  test("without an API key it says what's missing instead of calling Eventbrite", async () => {
    vi.stubEnv("EVENTBRITE_API_KEY", "");
    const staff = await makeSiteAdmin();

    await expect(call(router.eventbrite.verify, { eventbriteEventId: ID }, by(staff))).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: expect.stringContaining("EVENTBRITE_API_KEY"),
    });
  });

  test("only site staff may look events up, and only by a numeric id", async () => {
    mockEventbrite();
    const admin = await makeMember((await makeCommunity()).id, "admin");
    const staff = await makeSiteAdmin();

    await expect(call(router.eventbrite.verify, { eventbriteEventId: ID }, by(admin))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      call(router.eventbrite.verify, { eventbriteEventId: "../../users/me" }, by(staff))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
