import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { attendees, emailDeliveries } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeUser, type UserRow } from "test/factories";

import { expireOffers, forget } from "./service";

const DAY_MS = 86_400_000;

/** A published event with OWU sign-up, `days` ahead */
async function rsvpEvent(overrides: Parameters<typeof makeEvent>[1] = {}, days = 30) {
  const community = await makeCommunity();
  const startDate = new Date(Date.now() + days * DAY_MS);

  const event = await makeEvent(community.id, {
    status: "published",
    registration: "owu",
    capacity: 2,
    startDate,
    endDate: new Date(startDate.getTime() + 2 * 3_600_000),
    ...overrides,
  });

  return { community, event };
}

const join = (eventId: string, person: UserRow, extra: object = {}) =>
  call(router.rsvps.join, { eventId, ...extra }, by(person));

const statuses = async (eventId: string) =>
  (await db.select({ status: attendees.status }).from(attendees).where(eq(attendees.eventId, eventId))).map(
    (row) => row.status
  );

const mail = (to: string, kind: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

const people = (count: number) => Promise.all(Array.from({ length: count }, () => makeUser()));

describe("capacity", () => {
  test("twenty people joining at once fill five seats and wait in line for the rest", async () => {
    const { event } = await rsvpEvent({ capacity: 5 });
    const crowd = await people(20);

    await Promise.all(crowd.map((person) => join(event.id, person)));

    const all = await statuses(event.id);
    expect(all.filter((status) => status === "attending")).toHaveLength(5);
    expect(all.filter((status) => status === "waitlisted")).toHaveLength(15);
  });

  test("one person joining five times at once has one place", async () => {
    const { event } = await rsvpEvent();
    const [person] = await people(1);

    await Promise.all(Array.from({ length: 5 }, () => join(event.id, person)));

    await expect(statuses(event.id)).resolves.toStrictEqual(["attending"]);
  });

  test("a party that doesn't fit keeps its place; the next seat that fits it goes to it", async () => {
    const { event } = await rsvpEvent({ capacity: 3, guestsAllowed: 1 });
    const [ana, beto, caro] = await people(3);

    await expect(join(event.id, ana, { guests: 1 })).resolves.toMatchObject({ status: "attending" });
    await expect(join(event.id, beto, { guests: 1 })).resolves.toMatchObject({ status: "waitlisted", position: 1 });
    await expect(join(event.id, caro)).resolves.toMatchObject({ status: "attending" });
    await call(router.rsvps.leave, { eventId: event.id }, by(ana));

    await expect(call(router.rsvps.mine, { eventId: event.id }, by(beto))).resolves.toMatchObject({
      status: "offered",
    });
  });
});

describe("the waitlist", () => {
  test("a freed seat is offered for 24 h when the event is far; confirming takes it", async () => {
    const { event } = await rsvpEvent();
    const [ana, beto, caro] = await people(3);
    await join(event.id, ana);
    await join(event.id, beto);
    await join(event.id, caro);

    await call(router.rsvps.leave, { eventId: event.id }, by(ana));

    const offered = await call(router.rsvps.mine, { eventId: event.id }, by(caro));
    expect(offered?.status).toBe("offered");
    expect((Date.parse(offered?.offerExpiresAt ?? "") - Date.now()) / 3_600_000).toBeCloseTo(24, 0);
    await expect(mail(caro.email, "rsvp_offered")).resolves.toHaveLength(1);
    await expect(call(router.rsvps.confirmOffer, { eventId: event.id }, by(caro))).resolves.toMatchObject({
      status: "attending",
      code: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{10}$/),
    });
  });

  test("inside a day the seat is given at once", async () => {
    const { event } = await rsvpEvent({ capacity: 1 }, 0.5);
    const [ana, beto] = await people(2);
    await join(event.id, ana);
    await join(event.id, beto);

    await call(router.rsvps.leave, { eventId: event.id }, by(ana));

    await expect(call(router.rsvps.mine, { eventId: event.id }, by(beto))).resolves.toMatchObject({
      status: "attending",
    });
    await expect(mail(beto.email, "rsvp_promoted")).resolves.toHaveLength(1);
  });

  test("an offer nobody takes lapses and moves on to the next in line", async () => {
    const { event } = await rsvpEvent({ capacity: 1 });
    const [ana, beto, caro] = await people(3);
    await join(event.id, ana);
    await join(event.id, beto);
    await join(event.id, caro);
    await call(router.rsvps.leave, { eventId: event.id }, by(ana));
    await db
      .update(attendees)
      .set({ offerExpiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(attendees.eventId, event.id), eq(attendees.status, "offered")));

    await Effect.runPromiseWith(liveServices)(expireOffers);

    await expect(call(router.rsvps.mine, { eventId: event.id }, by(beto))).resolves.toMatchObject({
      status: "cancelled",
    });
    await expect(call(router.rsvps.mine, { eventId: event.id }, by(caro))).resolves.toMatchObject({
      status: "offered",
    });
    await expect(mail(beto.email, "rsvp_offer_expired")).resolves.toHaveLength(1);
  });
});

describe("signing up", () => {
  test("the confirmation carries a calendar invite and a ticket link that works without a session", async () => {
    const { event } = await rsvpEvent();
    const [ana] = await people(1);
    await join(event.id, ana);

    const [confirmation] = await mail(ana.email, "rsvp_confirmed");
    const invite = Buffer.from(confirmation.attachments[0]?.content ?? "", "base64").toString();
    expect(invite).toContain("METHOD:REQUEST");
    const token = /entrada\?t=(\S+)/.exec(confirmation.text)?.[1] ?? "";

    await expect(call(router.rsvps.ticket, { token }, by(null))).resolves.toMatchObject({
      rsvp: { status: "attending" },
    });
    await expect(call(router.rsvps.ticket, { token: `${token}x` }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(call(router.rsvps.leaveByToken, { token }, by(null))).resolves.toMatchObject({ status: "cancelled" });
  });

  test("closed events, missing answers and too many guests are refused", async () => {
    const { event } = await rsvpEvent({
      questions: [{ id: "q1", label: "¿Primera vez?", required: true }],
    });
    const draft = await rsvpEvent({ status: "draft" });
    const [ana] = await people(1);

    await expect(join(draft.event.id, ana)).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "closed" } });
    await expect(join(event.id, ana)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(join(event.id, ana, { guests: 1, answers: { q1: "Sí" } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(join(event.id, ana, { answers: { q1: "Sí" } })).resolves.toMatchObject({ status: "attending" });
  });

  test("with approval, people wait for the organizers, who take them or not", async () => {
    const { community, event } = await rsvpEvent({ approval: true });
    const editor = await makeMember(community.id, "editor");
    const [ana, beto] = await people(2);
    const pending = await join(event.id, ana);
    const other = await join(event.id, beto);
    const decide = (attendeeId: string, decision: "approve" | "decline") =>
      call(router.rsvps.review, { communityId: community.id, eventId: event.id, attendeeId, decision }, by(editor));

    expect(pending.status).toBe("pending");
    await expect(decide(pending.id, "approve")).resolves.toMatchObject({ status: "attending" });
    await expect(decide(other.id, "decline")).resolves.toMatchObject({ status: "declined" });
    await expect(decide(other.id, "approve")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(join(event.id, beto)).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "declined" } });
  });
});

describe("quiénes van", () => {
  test("the public page names only who chose it, as first name and initial, and only with a seat", async () => {
    const { community, event } = await rsvpEvent({ capacity: 2 });
    const [ana, bruno, carla] = await Promise.all([
      makeUser({ name: "Ana  González Pérez" }),
      makeUser({ name: "Bruno Díaz" }),
      makeUser({ name: "Carla" }),
    ]);
    await join(event.id, ana, { showName: true });
    await join(event.id, bruno);
    await join(event.id, carla, { showName: true });

    const page = await call(router.events.public, { communitySlug: community.slug, eventSlug: event.slug }, by(null));

    expect(page).toMatchObject({ taken: 2, waiting: 1, going: ["Ana G."] });
  });
});

describe("more room", () => {
  test("raising the capacity offers the new seats to the waitlist, in order", async () => {
    const { community, event } = await rsvpEvent({ capacity: 1 });
    const editor = await makeMember(community.id, "editor");
    const [first, second, third] = await people(3);
    for (const person of [first, second, third]) await join(event.id, person);
    const { updatedAt } = await call(router.events.get, { communityId: community.id, eventId: event.id }, by(editor));

    await call(
      router.events.save,
      { communityId: community.id, eventId: event.id, expectedUpdatedAt: updatedAt, patch: { capacity: 2 } },
      by(editor)
    );

    const rows = await db.select().from(attendees).where(eq(attendees.eventId, event.id));
    expect(new Map(rows.map((row) => [row.userId, row.status]))).toStrictEqual(
      new Map([
        [first.id, "attending"],
        [second.id, "offered"],
        [third.id, "waitlisted"],
      ])
    );
    await expect(mail(second.email, "rsvp_offered")).resolves.toHaveLength(1);
  });
});

describe(forget, () => {
  test("a deleted account gives its seat to the next in line and its sign-ups stop saying who", async () => {
    const { event } = await rsvpEvent({ capacity: 1 });
    const [leaving, next] = await people(2);
    await join(event.id, leaving, { answers: {} });
    await join(event.id, next);
    const past = await makeEvent(event.communityId, {
      status: "published",
      startDate: new Date("2025-05-01T22:00:00Z"),
      endDate: new Date("2025-05-02T01:00:00Z"),
    });
    await db.insert(attendees).values({
      eventId: past.id,
      source: "owu",
      userId: leaving.id,
      name: leaving.name,
      email: leaving.email,
      checkedInAt: new Date("2025-05-01T22:10:00Z"),
    });

    await Effect.runPromiseWith(liveServices)(forget(leaving.id));

    const rows = await db.select().from(attendees).where(eq(attendees.userId, leaving.id));
    expect(rows.map((row) => [row.eventId, row.status, row.name, row.email])).toStrictEqual(
      expect.arrayContaining([
        [event.id, "cancelled", "Anónimo", ""],
        [past.id, "attending", "Anónimo", ""],
      ])
    );
    await expect(statuses(event.id)).resolves.toContain("offered");
  });
});
