import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";

import { POST as webhook } from "app/api/eventbrite/webhook/route";
import { db } from "lib/db";
import { attendeeScans, attendeeSync, attendees, raffles } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import {
  makeAttendee,
  makeCommunity,
  makeEvent,
  makeMember,
  makeRsvp,
  makeSiteAdmin,
  makeUser,
  type UserRow,
} from "test/factories";
import { server } from "test/msw/server";

import { pickIndex } from "./raffles";

// The Eventbrite key is read when lib/orpc imports it, so it must be set first.
vi.hoisted(() => {
  process.env.EVENTBRITE_API_KEY = "eventbrite-test-key";
});

const API = "https://www.eventbriteapi.com/v3";

type EventbritePerson = ReturnType<typeof person>;

const person = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  created: "2026-10-01T12:00:00Z",
  changed: "2026-10-01T12:00:00Z",
  order_id: `o-${id}`,
  ticket_class_name: "General",
  checked_in: false,
  cancelled: false,
  refunded: false,
  profile: { name: `Persona ${id}`, email: `${id}@test.owu.uy` },
  barcodes: [{ barcode: `${id}001`, status: "unused", changed: "2026-10-01T12:00:00Z" }],
  ...overrides,
});

const checkedIn = (at: string, method: "scan" | "search") => ({
  checked_in: true,
  changed: at,
  barcodes: [{ barcode: "", status: "used", changed: at, checkin_method: method }],
});

/** Eventbrite serving the event's attendees in pages chained by continuation; every request is kept. */
function serveAttendees(eventbriteId: string, pages: EventbritePerson[][]) {
  const requests: URL[] = [];
  server.use(
    http.get(`${API}/events/${eventbriteId}/attendees/`, ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      // Like Eventbrite: attendee pages have a fixed size, and `page_size` is a 400.
      if (url.searchParams.has("page_size")) {
        return HttpResponse.json(
          { error: "ARGUMENTS_ERROR", error_description: "page_size - Unknown parameter" },
          { status: 400 }
        );
      }
      const index = Number(url.searchParams.get("continuation") ?? "0");
      const more = index < pages.length - 1;

      return HttpResponse.json({
        attendees: pages[index] ?? [],
        pagination: {
          object_count: pages.flat().length,
          page_number: index + 1,
          page_size: 50,
          page_count: pages.length,
          has_more_items: more,
          ...(more ? { continuation: String(index + 1) } : {}),
        },
      });
    })
  );

  return requests;
}

async function mirroredEvent() {
  const eventbriteId = `eb${createId().slice(0, 10)}`;
  const community = await makeCommunity();
  const event = await makeEvent(community.id, { eventbriteEventId: eventbriteId });

  return { event, eventbriteId, staff: await makeSiteAdmin() };
}

/** The event's mirror, by Eventbrite id. */
const mirror = async (eventId: string) =>
  Object.fromEntries(
    (await db.select().from(attendees).where(eq(attendees.eventId, eventId))).map((row) => [row.eventbriteId, row])
  );

/** Pretend the last sync was long enough ago that the next one reads Eventbrite again. */
const syncedLongAgo = (eventId: string) =>
  db
    .update(attendeeSync)
    .set({ syncedAt: new Date(Date.now() - 31_000) })
    .where(eq(attendeeSync.eventId, eventId));

const sync = (eventId: string, staff: UserRow, force = false) =>
  call(router.attendees.sync, { eventId, force }, by(staff));

const nonce = () => createId();

describe("the Eventbrite mirror", () => {
  test("the first sync reads every page and maps check-ins, doors and cancellations", async () => {
    const { event, eventbriteId, staff } = await mirroredEvent();
    const requests = serveAttendees(eventbriteId, [
      [
        person("a", checkedIn("2026-11-07T17:42:10Z", "scan")),
        person("b"),
        person("c", { cancelled: true, changed: "2026-10-03T12:00:00Z" }),
      ],
      [person("d", { refunded: true }), person("e", checkedIn("2026-11-07T17:50:00Z", "search"))],
    ]);

    await expect(sync(event.id, staff)).resolves.toMatchObject({
      ran: true,
      changed: 5,
      error: null,
      missing: null,
      eventbriteEventId: eventbriteId,
      syncedAt: expect.any(String),
    });
    expect(
      requests.map((url) => [url.searchParams.get("changed_since"), url.searchParams.get("continuation")])
    ).toStrictEqual([
      [null, null],
      [null, "1"],
    ]);
    await expect(mirror(event.id)).resolves.toMatchObject({
      a: {
        checkedInAt: new Date("2026-11-07T17:42:10Z"),
        checkinSource: "eventbrite",
        checkinDevice: "Escaneo",
        status: "attending",
        orderId: "o-a",
      },
      b: { checkedInAt: null, checkinSource: null, status: "attending" },
      c: { status: "cancelled" },
      d: { status: "refunded" },
      e: { checkinDevice: "Búsqueda" },
    });
  });

  test("within 30 s a sync doesn't read Eventbrite; after that it asks only for what changed", async () => {
    const { event, eventbriteId, staff } = await mirroredEvent();
    const requests = serveAttendees(eventbriteId, [[person("a"), person("b", { changed: "2026-10-05T09:30:00Z" })]]);
    await sync(event.id, staff);

    await expect(sync(event.id, staff)).resolves.toMatchObject({ ran: false, changed: 0 });
    await expect(sync(event.id, staff, true)).resolves.toMatchObject({ ran: false });

    await syncedLongAgo(event.id);
    // The newest `changed` comes back (Eventbrite's filter is inclusive), but nothing changed.
    await expect(sync(event.id, staff)).resolves.toMatchObject({ ran: true, changed: 0 });
    expect(requests.map((url) => url.searchParams.get("changed_since"))).toStrictEqual([null, "2026-10-05T09:30:00Z"]);
  });

  test("Eventbrite never takes back a check-in made with OWU's scanner", async () => {
    const { event, eventbriteId, staff } = await mirroredEvent();
    serveAttendees(eventbriteId, [[person("x")]]);
    await sync(event.id, staff);
    const scanned = await call(
      router.attendees.scan,
      { eventId: event.id, code: "x001", nonce: nonce(), device: "Puerta 2" },
      by(staff)
    );
    const owu = { checkedInAt: new Date(scanned.scannedAt), checkinSource: "owu", checkinDevice: "Puerta 2" };

    serveAttendees(eventbriteId, [[person("x", { changed: "2026-11-07T18:00:00Z" })]]);
    await syncedLongAgo(event.id);
    await expect(sync(event.id, staff)).resolves.toMatchObject({ changed: 1 });
    await expect(mirror(event.id)).resolves.toMatchObject({ x: owu });

    serveAttendees(eventbriteId, [[person("x", checkedIn("2026-11-07T18:30:00Z", "scan"))]]);
    await syncedLongAgo(event.id);
    await sync(event.id, staff);
    await expect(mirror(event.id)).resolves.toMatchObject({ x: owu });
  });

  test("an undone check-in is back to «por llegar», and Eventbrite doesn't bring it back", async () => {
    const { event, eventbriteId, staff } = await mirroredEvent();
    serveAttendees(eventbriteId, [[person("x", checkedIn("2026-11-07T18:30:00Z", "scan"))]]);
    await sync(event.id, staff);
    const { x } = await mirror(event.id);

    await call(router.attendees.undoCheckin, { eventId: event.id, attendeeId: x.id }, by(staff));
    serveAttendees(eventbriteId, [[person("x", checkedIn("2026-11-07T18:45:00Z", "scan"))]]);
    await syncedLongAgo(event.id);
    await sync(event.id, staff);

    await expect(mirror(event.id)).resolves.toMatchObject({ x: { checkedInAt: null, checkinDevice: null } });
    await expect(
      call(router.attendees.undoCheckin, { eventId: event.id, attendeeId: x.id }, by(staff))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.attendees.undoCheckin, { eventId: event.id, attendeeId: x.id }, by(await makeUser()))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("a key from outside the event's organization says so, instead of calling the key wrong", async () => {
    const { event, eventbriteId, staff } = await mirroredEvent();
    server.use(
      http.get(`${API}/events/${eventbriteId}/attendees/`, () =>
        HttpResponse.json({ error: "NOT_AUTHORIZED", status_code: 403 }, { status: 403 })
      )
    );

    await expect(sync(event.id, staff)).resolves.toMatchObject({
      ran: true,
      error: expect.stringContaining("no está en la organización del evento"),
    });
  });

  test("a failed read is recorded, the mirror keeps what it had, and the next good read clears it", async () => {
    const { event, eventbriteId, staff } = await mirroredEvent();
    serveAttendees(eventbriteId, [[person("a")]]);
    await sync(event.id, staff);

    server.use(http.get(`${API}/events/${eventbriteId}/attendees/`, () => HttpResponse.json({}, { status: 401 })));
    await syncedLongAgo(event.id);
    await expect(sync(event.id, staff)).resolves.toMatchObject({
      ran: true,
      error: "Eventbrite rechazó la clave de la API (EVENTBRITE_API_KEY)",
    });
    await expect(mirror(event.id)).resolves.toHaveProperty("a");

    serveAttendees(eventbriteId, [[person("a")]]);
    await expect(sync(event.id, staff)).resolves.toMatchObject({ ran: true, error: null });
  });

  test("an event without an Eventbrite id says so and reads nothing", async () => {
    const community = await makeCommunity();
    const event = await makeEvent(community.id);

    await expect(sync(event.id, await makeSiteAdmin())).resolves.toMatchObject({
      missing: "event_id",
      ran: false,
      eventbriteEventId: null,
    });
  });

  test("a webhook mirrors what its URL points at, only with the secret and only from Eventbrite", async () => {
    const { event, eventbriteId } = await mirroredEvent();
    process.env.EVENTBRITE_WEBHOOK_SECRET = "s3cret";
    const attendeeUrl = `${API}/events/${eventbriteId}/attendees/w/`;
    server.use(
      http.get(attendeeUrl, () =>
        HttpResponse.json(person("w", { event_id: eventbriteId, ...checkedIn("2026-11-07T17:45:00Z", "scan") }))
      )
    );
    const send = async (secret: string, apiUrl: string) => {
      const response = await webhook(
        new Request(`http://owu.test/api/eventbrite/webhook?secret=${secret}`, {
          method: "POST",
          body: JSON.stringify({ config: { action: "attendee.checked_in" }, api_url: apiUrl }),
        })
      );
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };

    await expect(send("wrong", attendeeUrl)).resolves.toMatchObject({ status: 401 });
    // Never followed: our key would go along with the request.
    await expect(send("s3cret", "https://evil.example.com/v3/events/1/attendees/2/")).resolves.toMatchObject({
      status: 200,
      body: { changed: 0 },
    });
    await expect(send("s3cret", attendeeUrl)).resolves.toMatchObject({ status: 200, body: { ok: true, changed: 1 } });
    await expect(mirror(event.id)).resolves.toMatchObject({
      w: { checkinSource: "eventbrite", checkinDevice: "Escaneo" },
    });
    await expect(db.select().from(attendeeSync).where(eq(attendeeSync.eventId, event.id))).resolves.toMatchObject([
      { webhookAt: expect.any(Date) },
    ]);
  });

  test("people's data is for the community's admins; the door, for any member; outsiders get nothing", async () => {
    const { event } = await mirroredEvent();
    const [admin, member] = await Promise.all([
      makeMember(event.communityId, "admin"),
      makeMember(event.communityId, "member"),
    ]);

    await expect(call(router.attendees.sync, { eventId: event.id }, by(await makeUser()))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.attendees.list, { eventId: event.id }, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(call(router.attendees.list, { eventId: event.id }, by(member))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.attendees.list, { eventId: event.id }, by(admin))).resolves.toMatchObject({ page: 1 });
    await expect(call(router.attendees.recent, { eventId: event.id }, by(member))).resolves.toStrictEqual([]);
  });
});

describe("the attendee list", () => {
  async function crowd() {
    const { event, staff } = await mirroredEvent();
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    const people = {
      maria: await makeAttendee(event.id, { name: "María Pérez", tags: ["vip"], barcode: "4242001" }),
      mario: await makeAttendee(event.id, { name: "Mario Paz", ticketClass: "Estudiante", checkedInAt: at(5) }),
      lucia: await makeAttendee(event.id, {
        name: "Lucía Sosa",
        ticketClass: "Speaker",
        tags: ["vip", "prensa"],
        checkedInAt: at(30),
      }),
      bruno: await makeAttendee(event.id, { name: "Bruno Cabrera", status: "cancelled" }),
      ana: await makeAttendee(event.id, { name: "Ana Núñez", checkedInAt: at(1) }),
    };
    // Someone else's event: never counted, never touched.
    await makeAttendee((await mirroredEvent()).event.id, { name: "María Otra", tags: ["vip"] });

    return { event, staff, people };
  }

  test("search ignores accents and case, every word has to match, and finds barcodes and emails", async () => {
    const { event, staff, people } = await crowd();
    const names = async (q: string) =>
      (await call(router.attendees.list, { eventId: event.id, q }, by(staff))).rows.map((row) => row.name);

    await expect(
      Promise.all(["maria", "PEREZ   marÍa", "nunez", "4242001", people.lucia.email, "50%"].map(names))
    ).resolves.toStrictEqual([["María Pérez"], ["María Pérez"], ["Ana Núñez"], ["María Pérez"], ["Lucía Sosa"], []]);
  });

  test("tabs and facets count with the other filters applied", async () => {
    const { event, staff } = await crowd();

    await expect(call(router.attendees.list, { eventId: event.id }, by(staff))).resolves.toMatchObject({
      totals: { all: 5, in: 3, out: 1, waiting: 0, pending: 0, cancelled: 1 },
      facets: {
        tickets: [
          { value: "General", count: 3 },
          { value: "Estudiante", count: 1 },
          { value: "Speaker", count: 1 },
        ],
        tags: [
          { value: "vip", count: 2 },
          { value: "prensa", count: 1 },
        ],
      },
    });

    // The tabs count within "General"; the ticket facet counts within "in".
    const generalIn = await call(
      router.attendees.list,
      { eventId: event.id, status: "in", ticket: ["General"] },
      by(staff)
    );
    expect(generalIn).toMatchObject({
      rows: [{ name: "Ana Núñez" }],
      facets: {
        status: { all: 3, in: 1, out: 1, cancelled: 1 },
        tickets: [
          { value: "Estudiante", count: 1 },
          { value: "General", count: 1 },
          { value: "Speaker", count: 1 },
        ],
      },
      totals: { all: 5 },
    });

    const vip = await call(router.attendees.list, { eventId: event.id, tag: ["vip"] }, by(staff));
    expect(vip.rows.map((row) => row.name)).toStrictEqual(["Lucía Sosa", "María Pérez"]);
  });

  test("pages and sorts over every attendee", async () => {
    const { event, staff } = await crowd();
    const page = async (sort: "name" | "-name" | "checkin", pageNumber: number) =>
      (
        await call(router.attendees.list, { eventId: event.id, sort, page: pageNumber, pageSize: 10 }, by(staff))
      ).rows.map((row) => row.name);

    await expect(page("checkin", 1)).resolves.toStrictEqual([
      "Ana Núñez",
      "Mario Paz",
      "Lucía Sosa",
      "Bruno Cabrera",
      "María Pérez",
    ]);
    await expect(page("-name", 1)).resolves.toHaveProperty([4], "Ana Núñez");
    await expect(page("name", 2)).resolves.toStrictEqual([]);
  });

  test("tags go on and off the selection, only inside the event", async () => {
    const { event, staff, people } = await crowd();
    const outsider = await makeAttendee((await mirroredEvent()).event.id);
    const ids = [people.maria.id, people.mario.id, outsider.id];

    await expect(
      call(router.attendees.setTags, { eventId: event.id, ids, add: ["staff", "vip"], remove: [] }, by(staff))
    ).resolves.toStrictEqual({ count: 2 });
    await call(
      router.attendees.setTags,
      { eventId: event.id, ids: [people.maria.id], add: [], remove: ["vip"] },
      by(staff)
    );

    await expect(mirror(event.id)).resolves.toMatchObject({
      [people.maria.eventbriteId]: { tags: ["staff"] },
      [people.mario.eventbriteId]: { tags: ["staff", "vip"] },
    });
    await expect(mirror(outsider.eventId)).resolves.toMatchObject({ [outsider.eventbriteId]: { tags: [] } });
  });

  test("the export is a CSV a spreadsheet opens safely", async () => {
    const { event, staff, people } = await crowd();
    await makeAttendee(event.id, { name: '=HYPERLINK("x")', email: "a,b@test.owu.uy" });

    const all = await call(router.attendees.export, { eventId: event.id }, by(staff));
    const lines = all.csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines).toStrictEqual(
      expect.arrayContaining([
        "Nombre,Email,Entrada,Estado,Acreditación,Etiquetas",
        `"'=HYPERLINK(""x"")","a,b@test.owu.uy",General,Por llegar,,`,
        expect.stringMatching(/^Lucía Sosa,.*,Speaker,Acreditado,\d{4}-\d{2}-\d{2} \d{2}:\d{2},"vip, prensa"$/),
      ])
    );
    expect(all.count).toBe(6);

    await expect(
      call(router.attendees.export, { eventId: event.id, ids: [people.bruno.id] }, by(staff))
    ).resolves.toMatchObject({
      count: 1,
      csv: expect.stringContaining("Bruno Cabrera"),
    });
  });
});

describe("OWU's own RSVPs next to the mirror", () => {
  async function registrations() {
    const event = await makeEvent((await makeCommunity()).id, { registration: "owu", capacity: 1 });
    const staff = await makeSiteAdmin();
    const people = {
      carla: await makeRsvp(event.id, { name: "Carla Anotada" }),
      diego: await makeRsvp(event.id, { name: "Diego Espera", status: "waitlisted" }),
      eva: await makeRsvp(event.id, { name: "Eva Oferta", status: "offered" }),
      fede: await makeRsvp(event.id, { name: "Fede Pendiente", status: "pending" }),
      gabi: await makeRsvp(event.id, { name: "Gabi Rechazada", status: "declined" }),
    };

    return { event, staff, people };
  }

  test("the waitlist and the approval queue get their own tabs, apart from cancellations", async () => {
    const { event, staff, people } = await registrations();
    const list = (status: "waiting" | "pending" | "cancelled") =>
      call(router.attendees.list, { eventId: event.id, status }, by(staff));

    await expect(call(router.attendees.list, { eventId: event.id }, by(staff))).resolves.toMatchObject({
      totals: { all: 5, in: 0, out: 1, waiting: 2, pending: 1, cancelled: 1 },
    });
    expect((await list("waiting")).rows.map((row) => row.name)).toStrictEqual(["Diego Espera", "Eva Oferta"]);
    expect((await list("cancelled")).rows.map((row) => row.name)).toStrictEqual(["Gabi Rechazada"]);
    // No Eventbrite id: search still finds the ticket code
    const found = await call(router.attendees.list, { eventId: event.id, q: people.carla.barcode ?? "" }, by(staff));
    expect(found.rows).toMatchObject([{ name: "Carla Anotada", eventbriteId: null, source: "owu" }]);
  });

  test("an OWU ticket checks in at the door; one still on the waitlist doesn't", async () => {
    const { event, staff, people } = await registrations();
    const scan = (code: string | null) =>
      call(router.attendees.scan, { eventId: event.id, code: code ?? "", nonce: nonce() }, by(staff));

    await expect(scan(people.carla.barcode)).resolves.toMatchObject({ result: "ok" });
    await expect(scan(people.diego.barcode)).resolves.toMatchObject({ result: "cancelled" });
  });

  test("the export names each state", async () => {
    const { event, staff } = await registrations();

    const { csv } = await call(router.attendees.export, { eventId: event.id }, by(staff));

    for (const word of [
      "Por llegar",
      "En lista de espera",
      "Lugar ofrecido",
      "Pendiente de aprobación",
      "No aprobada",
    ]) {
      expect(csv).toContain(word);
    }
  });
});

describe("OWU's scanner", () => {
  test("the first scan checks in; the same nonce replays; another scan is a repeat", async () => {
    const { event, staff } = await mirroredEvent();
    const ticket = await makeAttendee(event.id, { name: "Camila Rodríguez", barcode: "9000001" });
    const first = { eventId: event.id, code: "9000001", nonce: nonce(), device: "Puerta 2" };

    const admitted = await call(router.attendees.scan, first, by(staff));
    expect(admitted).toMatchObject({
      result: "ok",
      replayed: false,
      attendee: { name: "Camila Rodríguez", checkinSource: "owu", checkinDevice: "Puerta 2" },
    });
    await expect(call(router.attendees.scan, first, by(staff))).resolves.toMatchObject({
      result: "ok",
      replayed: true,
      scannedAt: admitted.scannedAt,
    });
    await expect(
      call(router.attendees.scan, { ...first, nonce: nonce(), device: "Puerta 1" }, by(staff))
    ).resolves.toMatchObject({
      result: "repeat",
      attendee: { checkedInAt: admitted.attendee?.checkedInAt, checkinDevice: "Puerta 2" },
    });
    await expect(
      db.select({ result: attendeeScans.result }).from(attendeeScans).where(eq(attendeeScans.attendeeId, ticket.id))
    ).resolves.toStrictEqual(expect.arrayContaining([{ result: "ok" }, { result: "repeat" }]));
  });

  test("a queued scan keeps its time, and a typed Eventbrite attendee id works as a code", async () => {
    const { event, staff } = await mirroredEvent();
    const ticket = await makeAttendee(event.id, { barcode: null });
    const scannedAt = new Date(Date.now() - 10 * 60_000).toISOString();

    await expect(
      call(
        router.attendees.scan,
        { eventId: event.id, code: ticket.eventbriteId, nonce: nonce(), scannedAt },
        by(staff)
      )
    ).resolves.toMatchObject({
      result: "ok",
      scannedAt,
      attendee: { checkedInAt: scannedAt, checkinDevice: "Escáner OWU" },
    });
  });

  test("a community admin takes back a wrong check-in; an editor can't", async () => {
    const community = await makeCommunity();
    const event = await makeEvent(community.id);
    const [admin, editor] = await Promise.all([makeMember(community.id, "admin"), makeMember(community.id, "editor")]);
    const ticket = await makeRsvp(event.id);
    await call(router.attendees.scan, { eventId: event.id, code: ticket.barcode ?? "", nonce: nonce() }, by(admin));
    const undo = (actor: UserRow) =>
      call(router.attendees.undoCheckin, { eventId: event.id, attendeeId: ticket.id }, by(actor));

    await expect(undo(editor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(undo(admin)).resolves.toStrictEqual({ ok: true });
    await expect(undo(admin)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      db.select({ checkedInAt: attendees.checkedInAt }).from(attendees).where(eq(attendees.id, ticket.id))
    ).resolves.toStrictEqual([{ checkedInAt: null }]);
  });

  test("unknown and cancelled tickets let nobody in", async () => {
    const { event, staff } = await mirroredEvent();
    await makeAttendee(event.id, { barcode: "7000001", status: "refunded" });
    const scan = (code: string) => call(router.attendees.scan, { eventId: event.id, code, nonce: nonce() }, by(staff));

    await expect(scan("nope")).resolves.toMatchObject({ result: "unknown", attendee: null });
    await expect(scan("7000001")).resolves.toMatchObject({
      result: "cancelled",
      attendee: { status: "refunded", checkedInAt: null },
    });
  });

  test("phones reading one ticket at the same moment let one person in", async () => {
    const { event, staff } = await mirroredEvent();
    await makeAttendee(event.id, { barcode: "8000001" });
    const read = () => call(router.attendees.scan, { eventId: event.id, code: "8000001", nonce: nonce() }, by(staff));

    const results = await Promise.all([read(), read(), read()]);

    expect(results.map((result) => result.result).toSorted()).toStrictEqual(["ok", "repeat", "repeat"]);
  });

  test("the feed shows arrivals, repeats and unknown codes; the stats count per door", async () => {
    const { event, staff } = await mirroredEvent();
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    const organizer = (minutes: number, device: string | null) =>
      ({ checkedInAt: ago(minutes), checkinSource: "eventbrite", checkinDevice: device }) as const;
    await makeAttendee(event.id, { name: "Temprano", ...organizer(40, "Escaneo") });
    await makeAttendee(event.id, { name: "Hace rato", ...organizer(10, "Búsqueda") });
    await makeAttendee(event.id, { name: "Ayer", ...organizer(26 * 60, null) });
    await makeAttendee(event.id, { name: "Recién", barcode: "6000001" });
    for (const code of ["6000001", "6000001", "no-existe"]) {
      await call(router.attendees.scan, { eventId: event.id, code, nonce: nonce(), device: "Puerta 3" }, by(staff));
    }

    const feed = await call(router.attendees.recent, { eventId: event.id }, by(staff));
    expect(feed.slice(0, 5).map((entry) => [entry.kind, entry.name ?? entry.code])).toStrictEqual([
      ["unknown", "no-existe"],
      ["repeat", "Recién"],
      ["in", "Recién"],
      ["in", "Hace rato"],
      ["in", "Temprano"],
    ]);

    const stats = await call(router.attendees.checkins, { eventId: event.id }, by(staff));
    expect({
      buckets: stats.buckets.length,
      lastHour: stats.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      last15: stats.last15,
    }).toStrictEqual({ buckets: 12, lastHour: 3, last15: 2 });
    expect(stats.doors).toStrictEqual(
      expect.arrayContaining([
        { source: "owu", device: "Puerta 3", count: 1 },
        { source: "eventbrite", device: "Escaneo", count: 1 },
        { source: "eventbrite", device: "Búsqueda", count: 1 },
        { source: "eventbrite", device: "Organizer", count: 1 },
      ])
    );
  });
});

describe("a raffle", () => {
  async function hat() {
    const { event, staff } = await mirroredEvent();
    const inside = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        makeAttendee(event.id, { name: `Ganadora ${index}`, checkedInAt: new Date() })
      )
    );
    await makeAttendee(event.id, { name: "Todavía afuera" });
    await makeAttendee(event.id, { name: "Cancelada adentro", status: "cancelled", checkedInAt: new Date() });

    return { event, staff, inside };
  }

  const listed = async (eventId: string, raffleId: string, staff: UserRow) =>
    (await call(router.attendees.raffles.list, { eventId }, by(staff))).find((raffle) => raffle.id === raffleId);

  /** Draw and hand over the prize until the hat is empty; the winners in order. */
  async function drawEveryone(eventId: string, raffleId: string, staff: UserRow) {
    for (let round = 0; round < 5; round += 1) {
      await call(router.attendees.raffles.draw, { raffleId }, by(staff));
      const pending = (await listed(eventId, raffleId, staff))?.draws.find((draw) => draw.status === "pending");
      await call(router.attendees.raffles.claim, { drawId: pending?.id ?? "" }, by(staff));
    }

    return (await listed(eventId, raffleId, staff))?.draws.map((draw) => draw.attendeeId) ?? [];
  }

  test("the same seed draws the same winners, in pool order, and nobody comes out twice", async () => {
    const { event, staff, inside } = await hat();
    const a = await call(router.attendees.raffles.create, { eventId: event.id, prize: "Remera" }, by(staff));
    const b = await call(router.attendees.raffles.create, { eventId: event.id, prize: "Taza" }, by(staff));
    await db.update(raffles).set({ seed: "semilla-fija" }).where(eq(raffles.eventId, event.id));
    const pool = inside.map((row) => row.id).toSorted((x, y) => (x < y ? -1 : x > y ? 1 : 0));

    const first = await drawEveryone(event.id, a.id, staff);

    await expect(drawEveryone(event.id, b.id, staff)).resolves.toStrictEqual(first);
    expect(first.toSorted()).toStrictEqual(pool.toSorted());
    expect(first[0]).toBe(pool[pickIndex("semilla-fija", 0, pool.length)]);
    await expect(call(router.attendees.raffles.draw, { raffleId: a.id }, by(staff))).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Ya salieron todos los acreditados",
    });
  });

  test("one winner waits at a time; a redraw sets them aside for good", async () => {
    const { event, staff } = await hat();
    const raffle = await call(router.attendees.raffles.create, { eventId: event.id, prize: "Stickers" }, by(staff));

    await call(router.attendees.raffles.draw, { raffleId: raffle.id }, by(staff));
    await expect(call(router.attendees.raffles.draw, { raffleId: raffle.id }, by(staff))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "raffle_pending" },
    });

    await call(router.attendees.raffles.redraw, { raffleId: raffle.id }, by(staff));
    const after = await listed(event.id, raffle.id, staff);
    expect({
      statuses: after?.draws.map((draw) => draw.status),
      distinct: new Set(after?.draws.map((draw) => draw.attendeeId)).size,
      pool: after?.pool,
    }).toStrictEqual({ statuses: ["redrawn", "pending"], distinct: 2, pool: 3 });

    const drawId = after?.draws[1]?.id ?? "";
    await call(router.attendees.raffles.claim, { drawId }, by(staff));
    await expect(call(router.attendees.raffles.claim, { drawId }, by(staff))).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  test("a new prize keeps the seed, so the draws so far still check out", async () => {
    const { event, staff } = await hat();
    const raffle = await call(router.attendees.raffles.create, { eventId: event.id, prize: "Remera" }, by(staff));
    await call(router.attendees.raffles.draw, { raffleId: raffle.id }, by(staff));
    const before = await listed(event.id, raffle.id, staff);

    await call(router.attendees.raffles.update, { raffleId: raffle.id, prize: "Remera talle M" }, by(staff));
    const after = await listed(event.id, raffle.id, staff);

    expect(after).toMatchObject({ prize: "Remera talle M", seed: before?.seed, draws: before?.draws });
  });

  test("a deleted raffle goes with its draws; only site staff edit or delete one", async () => {
    const { event, staff } = await hat();
    const raffle = await call(router.attendees.raffles.create, { eventId: event.id, prize: "Taza" }, by(staff));
    await call(router.attendees.raffles.draw, { raffleId: raffle.id }, by(staff));
    const owner = await makeMember(event.communityId, "owner");

    await expect(
      call(router.attendees.raffles.update, { raffleId: raffle.id, prize: "Otra" }, by(owner))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.attendees.raffles.delete, { raffleId: raffle.id }, by(owner))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await call(router.attendees.raffles.delete, { raffleId: raffle.id }, by(staff));

    await expect(listed(event.id, raffle.id, staff)).resolves.toBeUndefined();
    await expect(call(router.attendees.raffles.draw, { raffleId: raffle.id }, by(staff))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("with nobody inside there is nothing to draw", async () => {
    const { event, staff } = await mirroredEvent();
    await makeAttendee(event.id);
    const raffle = await call(router.attendees.raffles.create, { eventId: event.id, prize: "Remera" }, by(staff));

    await expect(call(router.attendees.raffles.draw, { raffleId: raffle.id }, by(staff))).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Todavía no hay nadie acreditado para sortear",
    });
  });
});

describe("counting attendees", () => {
  test("the sidebar and Asistentes agree: whoever has a ticket or already came in", async () => {
    const { event, staff } = await mirroredEvent();
    await makeAttendee(event.id, { checkedInAt: new Date() });
    await makeAttendee(event.id);
    // Refunded after coming in: still came.
    await makeAttendee(event.id, { status: "refunded", checkedInAt: new Date() });
    await makeAttendee(event.id, { status: "cancelled" });
    await db.insert(attendeeSync).values({ eventId: event.id, syncedAt: new Date() });

    const { totals } = await call(router.attendees.list, { eventId: event.id }, by(staff));
    const { counts } = await call(router.shell.status, { eventId: event.id }, by(staff));

    expect(totals.in + totals.out).toBe(3);
    expect(counts).toMatchObject({ attendees: 3, checkedIn: 2 });
  });
});
