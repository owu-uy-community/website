import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { attendees, eventPublications, events, integrationConnections } from "lib/db/schema";
import { applyWebhook } from "lib/orpc/attendees/service";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeAttendee, makeCommunity, makeEvent, makeMember, makeRsvp } from "test/factories";
import { server } from "test/msw/server";

import { connect, connectionByWebhookKey, pushDue } from "./service";

vi.hoisted(() => {
  process.env.EVENTBRITE_CLIENT_ID = "owu-app";
  process.env.EVENTBRITE_CLIENT_SECRET = "owu-app-secret";
});

const API = "https://www.eventbriteapi.com/v3";
const run = Effect.runPromiseWith(liveServices);
const pushNow = () => run(pushDue({ deadline: Date.now() + 10_000 }));

/** Eventbrite as far as OAuth and the webhook go; `calls` collects what was asked of it. */
function mockAccount(calls: string[] = []) {
  server.use(
    http.post("https://www.eventbrite.com/oauth/token", async ({ request }) => {
      const body = new URLSearchParams(await request.text());
      return body.get("code") === "good-code" && body.get("client_secret") === "owu-app-secret"
        ? HttpResponse.json({ access_token: "community-token", token_type: "bearer" })
        : HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
    }),
    http.get(`${API}/users/me/organizations/`, () =>
      HttpResponse.json({ organizations: [{ id: "org-1", name: "Comunidad en Eventbrite" }] })
    ),
    http.post(`${API}/organizations/org-1/webhooks/`, () => HttpResponse.json({ id: "hook-1" })),
    http.delete(`${API}/webhooks/hook-1/`, () => {
      calls.push("delete webhook");
      return HttpResponse.json({ success: true });
    })
  );

  return calls;
}

/** The publishing endpoints, recording each call (and its body) in order. */
function mockPublishing() {
  const calls: { path: string; body: unknown }[] = [];
  const record = async (request: Request) => {
    calls.push({
      path: `${request.method} ${new URL(request.url).pathname.replace("/v3", "")}`,
      body: request.method === "GET" ? null : await request.json().catch(() => null),
    });
  };
  server.use(
    http.post(`${API}/organizations/org-1/venues/`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ id: "venue-1" });
    }),
    http.post(`${API}/organizations/org-1/events/`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ id: "eb-1", url: "https://www.eventbrite.com/e/eb-1" });
    }),
    http.post(`${API}/events/eb-1/`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ id: "eb-1" });
    }),
    http.post(`${API}/events/eb-1/ticket_classes/`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ id: "tc-1" });
    }),
    http.post(`${API}/events/eb-1/ticket_classes/tc-1/`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ id: "tc-1" });
    }),
    http.get(`${API}/events/eb-1/structured_content/`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ page_version_number: "2" });
    }),
    http.post(`${API}/events/eb-1/structured_content/:version/`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({});
    }),
    http.post(`${API}/events/eb-1/publish/`, async ({ request }) => {
      await record(request);
      return HttpResponse.json({ published: true });
    })
  );

  return calls;
}

/** A community with Eventbrite connected and a draft ready to publish there. */
async function setup() {
  const community = await makeCommunity({ name: "Comunidad con Eventbrite" });
  const admin = await makeMember(community.id, "admin");
  mockAccount();
  await run(connect({ communityId: community.id, userId: admin.id, code: "good-code" }));
  const start = new Date(Date.now() + 20 * 86_400_000);
  const event = await makeEvent(community.id, {
    name: "Meetup en Eventbrite",
    summary: "Charlas y pizza",
    description: "Dos charlas.\n\nY pizza.",
    status: "draft",
    heldUntil: new Date(Date.now() + 7 * 86_400_000),
    registration: "eventbrite",
    capacity: 60,
    placeName: "Sala Uno",
    placeAddress: "Av. 18 de Julio 1234",
    startDate: start,
    endDate: new Date(start.getTime() + 2 * 3_600_000),
  });
  const ref = { communityId: community.id, eventId: event.id };

  return { community, admin, event, ref };
}

const publication = (eventId: string) =>
  db.select().from(eventPublications).where(eq(eventPublications.eventId, eventId));

describe("connecting Eventbrite", () => {
  test("the code becomes an encrypted token, the first organization and a webhook to a secret path", async () => {
    const { community } = await setup();

    const [connection] = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.communityId, community.id));

    expect(connection).toMatchObject({ organizationId: "org-1", webhookId: "hook-1", status: "active" });
    expect(connection.token).not.toContain("community-token");
    await expect(run(connectionByWebhookKey(connection.webhookKey))).resolves.toStrictEqual({
      communityId: community.id,
      token: "community-token",
    });
    await expect(run(connect({ communityId: community.id, userId: "nobody", code: "stolen-code" }))).rejects.toThrow(
      /no aceptó la autorización/
    );
  });
});

describe("publishing to Eventbrite", () => {
  test("publish creates it step by step, links the mirror, and an unchanged edit pushes nothing", async () => {
    const { event, ref, admin } = await setup();
    const calls = mockPublishing();

    await call(router.events.publish, ref, by(admin));
    await pushNow();

    expect(calls.map((entry) => entry.path)).toStrictEqual([
      "POST /organizations/org-1/venues/",
      "POST /organizations/org-1/events/",
      "POST /events/eb-1/ticket_classes/",
      "GET /events/eb-1/structured_content/",
      "POST /events/eb-1/structured_content/3/",
      "POST /events/eb-1/publish/",
    ]);
    expect(calls[2].body).toMatchObject({ ticket_class: { free: true, quantity_total: 60 } });
    await expect(db.select().from(events).where(eq(events.id, event.id))).resolves.toMatchObject([
      { eventbriteEventId: "eb-1", registrationUrl: "https://www.eventbrite.com/e/eb-1" },
    ]);
    await db
      .update(eventPublications)
      .set({ nextAttemptAt: new Date() })
      .where(eq(eventPublications.eventId, event.id));
    await pushNow();
    expect(calls).toHaveLength(6);
  });

  test("publishing there needs the community's account", async () => {
    const { community, admin, event, ref } = await setup();
    await db.delete(integrationConnections).where(eq(integrationConnections.communityId, community.id));

    await expect(call(router.events.publish, ref, by(admin))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(db.select().from(events).where(eq(events.id, event.id))).resolves.toMatchObject([{ status: "draft" }]);
  });

  test("cancelling an event with orders: Eventbrite refuses, so it's renamed CANCELADO and its tickets hidden", async () => {
    const { ref, admin } = await setup();
    const calls = mockPublishing();
    await call(router.events.publish, ref, by(admin));
    await pushNow();
    server.use(
      http.post(`${API}/events/eb-1/cancel/`, () =>
        HttpResponse.json({ error_description: "This event has orders" }, { status: 400 })
      )
    );

    await call(router.events.cancel, { ...ref, reason: "" }, by(admin));
    await pushNow();

    expect(calls.slice(6)).toStrictEqual([
      { path: "POST /events/eb-1/", body: { event: { name: { html: "CANCELADO · Meetup en Eventbrite" } } } },
      { path: "POST /events/eb-1/ticket_classes/tc-1/", body: { ticket_class: { hidden: true } } },
    ]);
  });

  test("a revoked token puts the connection in error and the publication waits for a reconnect", async () => {
    const { community, ref, admin, event } = await setup();
    server.use(
      http.post(`${API}/organizations/org-1/venues/`, () =>
        HttpResponse.json({ error_description: "Invalid OAuth token" }, { status: 401 })
      )
    );

    await call(router.events.publish, ref, by(admin));
    await pushNow();

    await expect(publication(event.id)).resolves.toMatchObject([{ status: "failed", nextAttemptAt: null }]);
    await expect(call(router.integrations.list, { communityId: community.id }, by(admin))).resolves.toMatchObject({
      eventbrite: { status: "error" },
    });
  });

  test("a failure retries with backoff, and gives up after the last attempt", async () => {
    const { ref, admin, event } = await setup();
    server.use(http.post(`${API}/organizations/org-1/venues/`, () => HttpResponse.json({}, { status: 503 })));
    await call(router.events.publish, ref, by(admin));

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await db
        .update(eventPublications)
        .set({ nextAttemptAt: new Date() })
        .where(eq(eventPublications.eventId, event.id));
      await pushNow();
    }

    await expect(publication(event.id)).resolves.toMatchObject([
      { status: "failed", attempts: 4, nextAttemptAt: null },
    ]);
    await call(router.integrations.retry, ref, by(admin));
    await expect(publication(event.id)).resolves.toMatchObject([{ status: "pending", attempts: 0 }]);
    // Nothing left due for the tests after this one
    await db.delete(eventPublications).where(eq(eventPublications.eventId, event.id));
  });
});

describe("disconnecting", () => {
  test("the token, the webhook and the attendees read from Eventbrite go; OWU's own sign-ups stay", async () => {
    const { community, ref, admin, event } = await setup();
    const removed = mockAccount();
    mockPublishing();
    await call(router.events.publish, ref, by(admin));
    await pushNow();
    await makeAttendee(event.id, { eventbriteId: "att-1" });
    const own = await makeRsvp(event.id);

    await call(router.integrations.disconnect, { communityId: community.id }, by(admin));

    expect(removed).toStrictEqual(["delete webhook"]);
    await expect(db.select().from(attendees).where(eq(attendees.eventId, event.id))).resolves.toMatchObject([
      { id: own.id },
    ]);
    await expect(db.select().from(events).where(eq(events.id, event.id))).resolves.toMatchObject([
      { eventbriteEventId: null },
    ]);
  });
});

describe("a community's webhook", () => {
  test("reads with its own token and only reaches its own events", async () => {
    const { community, event } = await setup();
    await db.update(events).set({ eventbriteEventId: "eb-9" }).where(eq(events.id, event.id));
    const other = await makeEvent((await makeCommunity()).id, { eventbriteEventId: "eb-9" });
    server.use(
      http.get(`${API}/events/eb-9/attendees/a-1/`, ({ request }) =>
        request.headers.get("authorization") === "Bearer community-token"
          ? HttpResponse.json({
              id: "a-1",
              created: "2026-10-01T12:00:00Z",
              ticket_class_name: "General",
              checked_in: false,
              cancelled: false,
              refunded: false,
              profile: { name: "Ana Webhook", email: "ana@test.owu.uy" },
            })
          : HttpResponse.json({}, { status: 401 })
      )
    );

    await run(
      applyWebhook(`${API}/events/eb-9/attendees/a-1/`, { communityId: community.id, token: "community-token" })
    );

    await expect(db.select().from(attendees).where(eq(attendees.eventId, event.id))).resolves.toMatchObject([
      { name: "Ana Webhook" },
    ]);
    await expect(db.select().from(attendees).where(eq(attendees.eventId, other.id))).resolves.toHaveLength(0);
  });
});
