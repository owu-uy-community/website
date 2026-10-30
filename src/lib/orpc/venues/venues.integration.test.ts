import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, events, venueRequests, venues } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeSiteAdmin, makeUser, makeVenue } from "test/factories";

import { expireRequests } from "./service";

const OPTIONS = [
  { day: "2029-09-11", startTime: "19:00", durationMin: 120 },
  { day: "2029-09-13", startTime: "18:30", durationMin: 120 },
];

async function setup() {
  const community = await makeCommunity({ name: "Comunidad pidiendo" });
  const editor = await makeMember(community.id, "editor", { name: "Ana Organizadora" });
  const venue = await makeVenue();

  return { community, editor, venue };
}

const ask = (communityId: string, venueId: string, actor: Parameters<typeof by>[0], extra: object = {}) =>
  call(
    router.venues.request,
    { communityId, venueId, options: OPTIONS, expectedAttendees: 40, message: "Somos tranquilos", ...extra },
    by(actor)
  );

/** The host's link, from the email that went out. */
async function hostToken(email: string) {
  const [mail] = await db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, email), eq(emailDeliveries.kind, "venue_request")));

  return /\/espacios\/pedido\/(\S+)$/.exec(mail.text)?.[1] ?? "";
}

const mail = (to: string, kind: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

describe("spaces", () => {
  test("organizers see spaces, never their contacts or address", async () => {
    const { community, editor, venue } = await setup();

    const listed = await call(router.venues.list, { communityId: community.id }, by(editor));

    expect(listed.find((item) => item.id === venue.id)).toMatchObject({ name: venue.name, requestable: true });
    const raw = JSON.stringify(listed);
    expect(raw).not.toContain(venue.contact?.email);
    expect(raw).not.toContain("Calle Falsa");
  });

  test("a request reaches the host, who takes a date from the link; then each side gets the other's email", async () => {
    const { community, editor, venue } = await setup();
    const draft = await makeEvent(community.id, { status: "draft", name: "Meetup de septiembre" });

    await ask(community.id, venue.id, editor, { eventId: draft.id });
    const token = await hostToken(venue.contact?.email ?? "");
    await expect(call(router.venues.byToken, { token }, by(null))).resolves.toMatchObject({
      communityName: "Comunidad pidiendo",
      organizerName: "Ana",
      eventName: "Meetup de septiembre",
      expectedAttendees: 40,
      status: "pending",
      addressVisibility: "attendees",
    });

    await call(
      router.venues.respond,
      {
        token,
        decision: "accept",
        option: 1,
        hostMessage: "Timbre 3B",
        shareContact: true,
        addressVisibility: "public",
      },
      by(null)
    );

    const [mine] = await call(router.venues.requests, { communityId: community.id }, by(editor));
    expect(mine).toMatchObject({
      status: "accepted",
      chosenOption: 1,
      address: "Calle Falsa 123",
      contact: venue.contact,
    });
    await expect(mail(editor.email, "venue_response")).resolves.toMatchObject([
      { subject: expect.stringContaining("los recibe") },
    ]);
    await expect(mail(venue.contact?.email ?? "", "venue_answered_host")).resolves.toMatchObject([
      { text: expect.stringContaining(editor.email) },
    ]);
    await expect(
      db
        .select({ venueId: events.venueId, startDate: events.startDate, visibility: venues.addressVisibility })
        .from(events)
        .innerJoin(venues, eq(venues.id, events.venueId))
        .where(eq(events.id, draft.id))
    ).resolves.toMatchObject([
      { venueId: venue.id, startDate: new Date("2029-09-13T21:30:00.000Z"), visibility: "public" },
    ]);
  });

  test("a link answers once, and only the real one, and not after it expires", async () => {
    const { community, editor, venue } = await setup();
    await ask(community.id, venue.id, editor);
    const token = await hostToken(venue.contact?.email ?? "");
    const answer = (value: string) => call(router.venues.respond, { token: value, decision: "decline" }, by(null));

    await expect(answer(`${token.slice(0, -2)}xx`)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await answer(token);
    await expect(answer(token)).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "already_answered" } });

    // Another request, left to expire
    const late = await ask(community.id, venue.id, editor);
    await db
      .update(venueRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(venueRequests.id, late.id));
    const lateToken = (await mail(venue.contact?.email ?? "", "venue_request")).find((row) =>
      row.dedupeKey.includes(late.id)
    );
    await expect(answer(/\/espacios\/pedido\/(\S+)$/.exec(lateToken?.text ?? "")?.[1] ?? "")).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "expired" },
    });
  });

  test("no requests to staff-coordinated spaces, twice in a row, or on days the space doesn't host", async () => {
    const { community, editor } = await setup();
    const coordinated = await makeVenue({ requestable: false }, null);
    const tuesdaysOnly = await makeVenue({ hostDays: [2] });
    const member = await makeMember(community.id, "member");

    await expect(ask(community.id, coordinated.id, editor)).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "not_requestable" },
    });
    await expect(ask(community.id, tuesdaysOnly.id, editor)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await ask(community.id, tuesdaysOnly.id, editor, { options: [OPTIONS[0]] });
    await expect(ask(community.id, tuesdaysOnly.id, editor, { options: [OPTIONS[0]] })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_pending" },
    });
    await expect(ask(community.id, tuesdaysOnly.id, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("a request respects the space's notice and its meetups a month", async () => {
    const { community, editor } = await setup();
    const strict = await makeVenue({ leadDays: 30, monthlyCap: 1 });
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await makeEvent(community.id, {
      status: "published",
      venueId: strict.id,
      startDate: new Date("2029-09-04T22:00:00Z"),
      endDate: new Date("2029-09-05T01:00:00Z"),
    });

    await expect(
      ask(community.id, strict.id, editor, { options: [{ ...OPTIONS[0], day: soon }] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("30 días de anticipación") });
    await expect(ask(community.id, strict.id, editor)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("ese mes"),
    });
  });

  test("the list ranks spaces for the event: what fits first, the reasons on the rest, Plan B last", async () => {
    const { community, editor } = await setup();
    const [small, roomy, planB] = await Promise.all([
      makeVenue({ capacity: 20 }),
      makeVenue({ capacity: 100, amenities: ["proyector"] }),
      makeVenue({ capacity: 300, fallback: true }),
    ]);

    const listed = await call(
      router.venues.list,
      { communityId: community.id, size: "30-60", needs: ["proyector"], day: "2029-09-13" },
      by(editor)
    );
    const ids = listed.map((venue) => venue.id).filter((id) => [small.id, roomy.id, planB.id].includes(id));

    expect(ids).toStrictEqual([roomy.id, small.id, planB.id]);
    expect(listed.find((venue) => venue.id === small.id)?.fit).toStrictEqual({
      blockers: ["Entran 20"],
      missing: ["proyector"],
      score: 20,
    });
  });

  test("an unanswered request expires and its organizer hears about it", async () => {
    const { community, editor, venue } = await setup();
    const request = await ask(community.id, venue.id, editor);
    await db
      .update(venueRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(venueRequests.id, request.id));

    await Effect.runPromiseWith(liveServices)(expireRequests);

    await expect(db.select().from(venueRequests).where(eq(venueRequests.id, request.id))).resolves.toMatchObject([
      { status: "expired" },
    ]);
    await expect(mail(editor.email, "venue_response")).resolves.toMatchObject([
      { subject: expect.stringContaining("venció") },
    ]);
  });

  test("Sumá tu espacio: whoever offers becomes its contact; staff approve it and only staff see contacts", async () => {
    const host = await makeUser({ name: "Empresa Host" });
    const staff = await makeSiteAdmin();
    const { id } = await call(
      router.venues.submit,
      {
        name: "Empresa que presta",
        neighbourhood: "Pocitos",
        capacity: 50,
        amenities: ["proyector", "wifi"],
        hostDays: [2, 3, 4],
        availability: "Martes a jueves desde las 18:30",
        consent: true,
      },
      by(host)
    );

    await expect(db.select().from(venues).where(eq(venues.id, id))).resolves.toMatchObject([{ status: "pending" }]);
    await call(router.venues.manage.update, { venueId: id, data: { status: "active", requestable: true } }, by(staff));
    const managed = await call(router.venues.manage.list, undefined, by(staff));
    expect(managed.find((venue) => venue.id === id)?.contacts).toMatchObject([{ email: host.email }]);
    await expect(call(router.venues.manage.list, undefined, by(host))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
