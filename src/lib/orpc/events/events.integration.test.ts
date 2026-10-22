import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, events } from "lib/db/schema";
import { openApiHandler, requestContext } from "lib/orpc/handlers";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp } from "test/factories";

import { remindExpiringHolds } from "./service";

const DAY_MS = 86_400_000;
const heldFor = (until: string | null) => (until ? (Date.parse(until) - Date.now()) / DAY_MS : 0);

async function setup() {
  const topic = `t-${createId().slice(0, 8)}`;
  const community = await makeCommunity({ name: "Nuestra", topics: [topic] });
  const editor = await makeMember(community.id, "editor");

  return { topic, community, editor };
}

const hold = (communityId: string, actor: Parameters<typeof by>[0], extra: Record<string, unknown> = {}) =>
  call(
    router.events.hold,
    { communityId, day: "2029-07-10", startTime: "19:00", durationMin: 120, ...extra },
    by(actor)
  );

const mailTo = (email: string, kind: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, email), eq(emailDeliveries.kind, kind)));

describe("date holds", () => {
  test("reserving makes a draft held for 14 days; renewing moves it; releasing keeps the draft", async () => {
    const { community, editor } = await setup();

    const held = await hold(community.id, editor, { title: "Meetup de julio" });
    expect(held).toMatchObject({ status: "draft", name: "Meetup de julio", dateChosen: true, headsUp: 0 });
    expect(heldFor(held.heldUntil)).toBeCloseTo(14, 0);

    const moved = await hold(community.id, editor, { eventId: held.id, day: "2029-07-12", startTime: "18:30" });
    expect(moved).toMatchObject({ id: held.id, startDate: "2029-07-12T21:30:00.000Z" });

    const released = await call(router.events.release, { communityId: community.id, eventId: held.id }, by(editor));
    expect(released).toMatchObject({ heldUntil: null, dateChosen: false });
  });

  test("only organizers reserve, never a past date, never over a published event", async () => {
    const { community, editor } = await setup();
    const member = await makeMember(community.id, "member");
    const published = await makeEvent(community.id);

    await expect(hold(community.id, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(hold(community.id, editor, { day: "2020-01-07" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(hold(community.id, editor, { eventId: published.id })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "not_draft" },
    });
  });

  test("a community keeps at most 8 live holds", async () => {
    const { community, editor } = await setup();
    for (let index = 0; index < 8; index++) await hold(community.id, editor, { day: `2029-08-${10 + index}` });

    await expect(hold(community.id, editor, { day: "2029-08-20" })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "too_many_holds" },
    });
  });

  test("drafts can be deleted; published events can't", async () => {
    const { community, editor } = await setup();
    const draft = await hold(community.id, editor);
    const published = await makeEvent(community.id);

    await call(router.events.remove, { communityId: community.id, eventId: draft.id }, by(editor));

    await expect(db.select().from(events).where(eq(events.id, draft.id))).resolves.toStrictEqual([]);
    await expect(
      call(router.events.remove, { communityId: community.id, eventId: published.id }, by(editor))
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const listed = await call(router.events.list, { communityId: community.id }, by(editor));
    expect(listed.map((event) => event.id)).toStrictEqual([published.id]);
  });
});

describe("heads-ups", () => {
  test("a similar community with something that day hears about the hold, once; an unrelated one doesn't", async () => {
    const { topic, community, editor } = await setup();
    const similar = await makeCommunity({ name: "Parecida", topics: [topic] });
    const unrelated = await makeCommunity({ name: "Otra", topics: [`o-${topic}`] });
    const [similarOwner, unrelatedOwner] = await Promise.all([
      makeMember(similar.id, "owner"),
      makeMember(unrelated.id, "owner"),
    ]);
    const evening = { startDate: new Date("2029-07-10T22:00:00Z"), endDate: new Date("2029-07-11T00:00:00Z") };
    await Promise.all([makeEvent(similar.id, { name: "Su meetup", ...evening }), makeEvent(unrelated.id, evening)]);

    const held = await hold(community.id, editor);
    await hold(community.id, editor, { eventId: held.id });
    await hold(community.id, editor, { title: "Otra reserva el mismo día" });

    expect(held.headsUp).toBe(1);
    const told = await mailTo(similarOwner.email, "conflict_heads_up");
    expect(told).toHaveLength(1);
    expect(told[0].text).toContain("Nuestra reservó el mar 10 jul · 19:00, el mismo día que tu evento «Su meetup»");
    await expect(mailTo(unrelatedOwner.email, "conflict_heads_up")).resolves.toHaveLength(0);
  });

  test("organizers are reminded once before a hold runs out", async () => {
    const { community, editor } = await setup();
    const draft = await makeEvent(community.id, {
      status: "draft",
      heldUntil: new Date(Date.now() + DAY_MS),
      startDate: new Date("2029-07-10T22:00:00Z"),
      endDate: new Date("2029-07-11T00:00:00Z"),
    });

    await Effect.runPromiseWith(liveServices)(remindExpiringHolds);
    await Effect.runPromiseWith(liveServices)(remindExpiringHolds);

    const reminders = await mailTo(editor.email, "hold_expiring");
    expect(reminders).toHaveLength(1);
    expect(reminders[0].dedupeKey).toContain(draft.id);
  });
});

describe("events.upcoming", () => {
  test("anyone can GET the published events still ahead, never drafts or past ones", async () => {
    const community = await makeCommunity();
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const [published, draft, past] = await Promise.all([
      makeEvent(community.id, { status: "published", startDate: soon, endDate: new Date(soon.getTime() + 7_200_000) }),
      makeEvent(community.id, { status: "draft", startDate: soon, endDate: new Date(soon.getTime() + 7_200_000) }),
      makeEvent(community.id, {
        status: "published",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-01-02"),
      }),
    ]);

    const { response = new Response(null, { status: 404 }) } = await openApiHandler.handle(
      new Request("http://localhost/api/v1/events/upcoming"),
      {
        prefix: "/api/v1",
        context: requestContext(new Headers()),
      }
    );
    const ids = ((await response.json()) as { id: string; url: string }[]).map((event) => event.id);

    expect(response.status).toBe(200);
    expect(ids).toContain(published.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(past.id);
  });
});

describe("events.showUp", () => {
  test("the share of seated people who came, once three past events used the door", async () => {
    const community = await makeCommunity();
    const editor = await makeMember(community.id, "editor");
    const ask = () => call(router.events.showUp, { communityId: community.id }, by(editor));
    const pastEvent = (daysAgo: number) =>
      makeEvent(community.id, {
        status: "published",
        registration: "owu",
        startDate: new Date(Date.now() - daysAgo * 86_400_000),
        endDate: new Date(Date.now() - daysAgo * 86_400_000 + 7_200_000),
      });
    // Each event: four with a seat, of whom `came` checked in
    const withDoor = async (daysAgo: number, came: number) => {
      const event = await pastEvent(daysAgo);
      await Promise.all(
        Array.from({ length: 4 }, (_, index) => makeRsvp(event.id, { checkedInAt: index < came ? new Date() : null }))
      );
    };

    await withDoor(30, 2);
    await withDoor(60, 3);
    await expect(ask()).resolves.toStrictEqual({ rate: null, events: 2 });

    await withDoor(90, 1);
    await pastEvent(120).then((event) => makeRsvp(event.id));

    await expect(ask()).resolves.toStrictEqual({ rate: 0.5, events: 3 });
  });
});
