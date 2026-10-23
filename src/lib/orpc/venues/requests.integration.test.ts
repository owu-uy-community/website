import { call } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, like } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, events, venueContacts, venueRequests, venues } from "lib/db/schema";
import { signLink } from "lib/links";
import { HOLD_DAYS, MAX_HOLDS } from "lib/organizar/rules";
import { router } from "lib/orpc/router";
import type { Amenity } from "lib/orpc/venues/schemas";
import { sendUpdates } from "lib/orpc/rsvps/service";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp, makeVenue } from "test/factories";

const DAY = 86_400_000;
const run = Effect.runPromiseWith(liveServices);
const OPTIONS = [{ day: "2029-09-11", startTime: "19:00", durationMin: 120 }];

async function setup() {
  const community = await makeCommunity({ name: `Comunidad ${createId().slice(0, 6)}` });
  const editor = await makeMember(community.id, "editor", { name: "Ana Organizadora" });

  return { community, editor };
}

const mail = (to: string, kind: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

/** A host's link for a request, from the email it got. */
async function tokenFor(email: string, requestId: string) {
  const [row] = await db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, email), like(emailDeliveries.dedupeKey, `venue_request:${requestId}:%`)));

  return /\/espacios\/pedido\/(\S+)$/.exec(row?.text ?? "")?.[1] ?? "";
}

const requestRow = (id: string) => db.select().from(venueRequests).where(eq(venueRequests.id, id));
const eventRow = (id: string) => db.select().from(events).where(eq(events.id, id));

describe("another date (propose)", () => {
  /** A draft's request, answered with two other dates. */
  async function proposed() {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    const draft = await makeEvent(community.id, { status: "draft", name: "Meetup de octubre" });
    const asked = await call(
      router.venues.request,
      { communityId: community.id, venueId: venue.id, eventId: draft.id, options: OPTIONS, expectedAttendees: 40 },
      by(editor)
    );
    const token = await tokenFor(venue.contact?.email ?? "", asked.id);
    await call(
      router.venues.respond,
      {
        token,
        decision: "propose",
        options: [
          { day: "2029-09-18", startTime: "18:30", durationMin: 150 },
          { day: "2029-09-25", startTime: "19:00", durationMin: 120 },
        ],
        hostMessage: "Esa semana estamos de mudanza",
        shareContact: true,
      },
      by(null)
    );

    return { community, editor, venue, draft, asked, token };
  }

  test("the host proposes dates: stored, the organizer hears it, and the contact counts as confirmed", async () => {
    const { editor, venue, asked, token } = await proposed();

    await expect(requestRow(asked.id)).resolves.toMatchObject([
      {
        status: "proposed",
        counterOptions: [{ start: "2029-09-18T21:30:00.000Z" }, { start: "2029-09-25T22:00:00.000Z" }],
      },
    ]);
    await expect(mail(editor.email, "venue_response")).resolves.toMatchObject([
      { subject: expect.stringContaining("propone otra fecha"), text: expect.stringContaining("mudanza") },
    ]);
    await expect(call(router.venues.byToken, { token }, by(null))).resolves.toMatchObject({ status: "proposed" });
    await expect(db.select().from(venueContacts).where(eq(venueContacts.venueId, venue.id))).resolves.toMatchObject([
      { lastConfirmedAt: expect.any(Date) },
    ]);
  });

  test("accepting one of them holds it for the draft (HOLD_DAYS) and the host gets the organizer's contact", async () => {
    const { community, editor, venue, draft, asked } = await proposed();

    const accepted = await call(
      router.venues.acceptProposal,
      { communityId: community.id, requestId: asked.id, option: 1 },
      by(editor)
    );

    expect(accepted).toMatchObject({
      status: "accepted",
      chosenOption: 2,
      address: "Calle Falsa 123",
      options: [{}, {}, { start: "2029-09-25T22:00:00.000Z" }],
    });
    const [event] = await eventRow(draft.id);
    expect(event).toMatchObject({ venueId: venue.id, startDate: new Date("2029-09-25T22:00:00.000Z") });
    expect(Math.round(((event.heldUntil?.getTime() ?? 0) - Date.now()) / DAY)).toBe(HOLD_DAYS);
    await expect(mail(venue.contact?.email ?? "", "venue_answered_host")).resolves.toMatchObject([
      { text: expect.stringContaining(editor.email) },
    ]);
  });

  test("none of the host's dates works: the request closes and the host is thanked", async () => {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    const asked = await call(
      router.venues.request,
      { communityId: community.id, venueId: venue.id, options: OPTIONS, expectedAttendees: 40 },
      by(editor)
    );
    await call(
      router.venues.respond,
      {
        token: await tokenFor(venue.contact?.email ?? "", asked.id),
        decision: "propose",
        options: [{ day: "2029-10-02", startTime: "19:00", durationMin: 120 }],
      },
      by(null)
    );

    await call(router.venues.declineProposal, { communityId: community.id, requestId: asked.id }, by(editor));

    await expect(requestRow(asked.id)).resolves.toMatchObject([{ status: "cancelled" }]);
    await expect(mail(venue.contact?.email ?? "", "venue_proposal_declined")).resolves.toHaveLength(1);
    await expect(
      call(router.venues.acceptProposal, { communityId: community.id, requestId: asked.id, option: 0 }, by(editor))
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "not_proposed" } });
  });
});

describe("accepting dates the event", () => {
  test("on a draft, past the hold cap, the date and space go in but no new hold", async () => {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    for (let index = 0; index < MAX_HOLDS; index++) {
      await makeEvent(community.id, { status: "draft", heldUntil: new Date(Date.now() + 5 * DAY) });
    }
    const draft = await makeEvent(community.id, { status: "draft" });
    const asked = await call(
      router.venues.request,
      { communityId: community.id, venueId: venue.id, eventId: draft.id, options: OPTIONS, expectedAttendees: 40 },
      by(editor)
    );

    await call(
      router.venues.respond,
      { token: await tokenFor(venue.contact?.email ?? "", asked.id), decision: "accept", option: 0 },
      by(null)
    );

    await expect(eventRow(draft.id)).resolves.toMatchObject([
      { venueId: venue.id, heldUntil: null, startDate: new Date("2029-09-11T22:00:00.000Z") },
    ]);
  });

  test("on a published event, its people hear about the new place once, after the debounce", async () => {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    const event = await makeEvent(community.id, {
      status: "published",
      registration: "owu",
      startDate: new Date("2029-09-11T22:00:00.000Z"),
      endDate: new Date("2029-09-12T00:00:00.000Z"),
    });
    const person = await makeRsvp(event.id);
    const asked = await call(
      router.venues.request,
      { communityId: community.id, venueId: venue.id, eventId: event.id, options: OPTIONS, expectedAttendees: 40 },
      by(editor)
    );

    await call(
      router.venues.respond,
      { token: await tokenFor(venue.contact?.email ?? "", asked.id), decision: "accept", option: 0 },
      by(null)
    );

    await expect(eventRow(event.id)).resolves.toMatchObject([{ venueId: venue.id, icsSequence: 1 }]);
    await db
      .update(events)
      .set({ updatedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(events.id, event.id));
    await run(sendUpdates);
    await run(sendUpdates);
    await expect(mail(person.email, "rsvp_updated")).resolves.toHaveLength(1);
  });
});

describe("Buscamos espacio (broadcast)", () => {
  async function broadcastSetup(extra: "accesible" | "wifi") {
    const { community, editor } = await setup();
    const tag = createId().slice(0, 6);
    // Needs nobody else's test spaces have, so other files' spaces don't compete for the five places
    const amenities = ["microfono", "comida", extra] as Amenity[];
    const [first, second, third] = await Promise.all([
      makeVenue({ name: `A ${tag}`, capacity: 80, amenities }),
      makeVenue({ name: `B ${tag}`, capacity: 80, amenities }),
      makeVenue({ name: `C ${tag}`, capacity: 80, amenities }),
    ]);
    const small = await makeVenue({ name: `Chico ${tag}`, capacity: 20, amenities });
    const planB = await makeVenue({ name: `Plan B ${tag}`, fallback: true, amenities });
    const input = {
      communityId: community.id,
      options: [{ day: "2029-11-13", startTime: "19:00", durationMin: 120 }],
      size: "30-60" as const,
      needs: amenities,
    };

    return { community, editor, venues: [first, second, third], small, planB, input };
  }

  test("goes to the spaces that fit (never a too-small one or the Plan B) and contacts stay hidden", async () => {
    const { editor, venues: fitting, small, planB, input } = await broadcastSetup("accesible");

    const preview = await call(router.venues.broadcastPreview, input, by(editor));
    const ids = preview.map((venue) => venue.id);

    expect(ids.toSorted()).toStrictEqual(fitting.map((venue) => venue.id).toSorted());
    expect(ids).not.toContain(small.id);
    expect(ids).not.toContain(planB.id);
    expect(JSON.stringify(preview)).not.toContain("@host.test.owu.uy");
  });

  test("two hosts accept at once: one takes it, the other reads «ya se resolvió»; the rest are closed and told", async () => {
    const { editor, venues: fitting, input } = await broadcastSetup("wifi");
    const sent = await call(
      router.venues.broadcast,
      { ...input, expectedAttendees: 45, message: "Somos tranquilos" },
      by(editor)
    );
    const rows = await db.select().from(venueRequests).where(eq(venueRequests.broadcastId, sent.broadcastId));
    const requestOf = (venueId: string) => rows.find((row) => row.venueId === venueId)?.id ?? "";
    const tokens = await Promise.all(fitting.map((venue) => tokenFor(venue.contact?.email ?? "", requestOf(venue.id))));

    const answers = await Promise.allSettled(
      tokens.slice(0, 2).map((token) => call(router.venues.respond, { token, decision: "accept", option: 0 }, by(null)))
    );

    expect(answers.map((answer) => answer.status).toSorted()).toStrictEqual(["fulfilled", "rejected"]);
    expect(answers.find((answer) => answer.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT", data: { reason: "taken" } },
    });
    const loser = answers.findIndex((answer) => answer.status === "rejected");
    await expect(
      Promise.all([loser, 2].map((at) => call(router.venues.byToken, { token: tokens[at] ?? "" }, by(null))))
    ).resolves.toMatchObject([
      { status: "cancelled", taken: true },
      { status: "cancelled", taken: true },
    ]);
    const after = await db.select().from(venueRequests).where(eq(venueRequests.broadcastId, sent.broadcastId));
    expect(after.map((row) => row.status).toSorted()).toStrictEqual(["accepted", "cancelled", "cancelled"]);
    // The third space is thanked; only the winner's answer reaches the organizer, once
    const [closed, answered] = await Promise.all([
      mail(fitting[2]?.contact?.email ?? "", "venue_broadcast_closed"),
      mail(editor.email, "venue_response"),
    ]);
    expect([closed.length, answered.length]).toStrictEqual([1, 1]);
  });
});

describe("links and contacts", () => {
  test("an expired or forged link fails, and reading a link never changes the request", async () => {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    const asked = await call(
      router.venues.request,
      { communityId: community.id, venueId: venue.id, options: OPTIONS, expectedAttendees: 40 },
      by(editor)
    );
    const expired = await signLink("venue-request", asked.id, new Date(Date.now() - 1000));
    const forged = await signLink("venue-check", asked.id);

    await expect(call(router.venues.byToken, { token: expired }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(call(router.venues.byToken, { token: forged }, by(null))).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [before] = await requestRow(asked.id);
    await call(router.venues.byToken, { token: await tokenFor(venue.contact?.email ?? "", asked.id) }, by(null));
    await expect(requestRow(asked.id)).resolves.toStrictEqual([before]);
  });

  test("organizers never see a contact before an accept, nor in the list", async () => {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    await call(
      router.venues.request,
      { communityId: community.id, venueId: venue.id, options: OPTIONS, expectedAttendees: 40 },
      by(editor)
    );

    const [mine] = await call(router.venues.requests, { communityId: community.id }, by(editor));
    expect(mine).toMatchObject({ status: "pending", contact: null, address: null });
    const listed = await call(router.venues.list, { communityId: community.id }, by(editor));
    expect(JSON.stringify([mine, listed])).not.toContain(venue.contact?.email);
  });

  test("«esta persona ya no está» asks staff to check, and re-sends only this request to the space's other contact", async () => {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    const asked = await call(
      router.venues.request,
      { communityId: community.id, venueId: venue.id, options: OPTIONS, expectedAttendees: 40 },
      by(editor)
    );
    // Someone who joined the space's contacts after the request went out
    const second = { name: "Otra persona", email: `${createId()}@host.test.owu.uy` };
    await db.insert(venueContacts).values({ venueId: venue.id, ...second, consentAt: new Date(Date.now() - DAY) });
    await db
      .update(venueContacts)
      .set({ lastConfirmedAt: new Date() })
      .where(eq(venueContacts.email, venue.contact?.email ?? ""));

    await expect(
      call(router.venues.contactLeft, { communityId: community.id, requestId: asked.id }, by(editor))
    ).resolves.toStrictEqual({ remaining: 1 });
    const contacts = await db.select().from(venueContacts).where(eq(venueContacts.venueId, venue.id));
    // Flagged for staff, not marked gone: one organizer can't take a contact (or a space) off for everyone
    expect(contacts.find((contact) => contact.email === venue.contact?.email)).toMatchObject({
      leftAt: null,
      leftReportedAt: expect.any(Date),
    });
    await expect(mail(second.email, "venue_request")).resolves.toHaveLength(1);

    // With nobody else to ask, the request stays as it is and the space stays open to other communities
    await expect(
      call(router.venues.contactLeft, { communityId: community.id, requestId: asked.id }, by(editor))
    ).resolves.toStrictEqual({ remaining: 0 });
    const [[request], [space]] = await Promise.all([
      requestRow(asked.id),
      db.select().from(venues).where(eq(venues.id, venue.id)),
    ]);
    expect([request.status, space.requestable]).toStrictEqual(["pending", true]);
  });

  test("a cancel can be undone while the request is in time", async () => {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    const asked = await call(
      router.venues.request,
      { communityId: community.id, venueId: venue.id, options: OPTIONS, expectedAttendees: 40 },
      by(editor)
    );
    const ref = { communityId: community.id, requestId: asked.id };

    await call(router.venues.cancelRequest, ref, by(editor));
    await expect(call(router.venues.reopenRequest, ref, by(editor))).resolves.toMatchObject({ status: "pending" });
    await expect(call(router.venues.reopenRequest, ref, by(editor))).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
