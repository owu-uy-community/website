import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { activity, communityMembers, events, outboundMessages } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeBoard, makeCommunity, makeEvent, makeMember, makeRsvp, makeVenue } from "test/factories";

import { publishDue } from "./service";

async function setup() {
  const community = await makeCommunity({ name: "Comunidad del asistente" });
  const [editor, admin] = await Promise.all([makeMember(community.id, "editor"), makeMember(community.id, "admin")]);

  return { community, editor, admin };
}

const draft = (communityId: string, actor: Parameters<typeof by>[0], extra: object = {}) =>
  call(router.events.createDraft, { communityId, ...extra }, by(actor));

describe("the wizard", () => {
  test("a new draft starts untitled with a provisional date; another can start from a past event", async () => {
    const { community, editor } = await setup();
    const past = await makeEvent(community.id, { name: "Meetup de octubre", summary: "Charlas y pizza", capacity: 80 });

    const fresh = await draft(community.id, editor);
    const copy = await draft(community.id, editor, { copyFrom: past.id });

    expect(fresh).toMatchObject({ status: "draft", name: "Evento sin título", dateChosen: false, registration: "owu" });
    expect(Date.parse(fresh.startDate)).toBeGreaterThan(Date.now() + 20 * 86_400_000);
    expect(copy).toMatchObject({
      name: "Meetup de octubre",
      summary: "Charlas y pizza",
      capacity: 80,
      status: "draft",
    });
  });

  test("autosave applies what changed, and refuses a stale editor", async () => {
    const { community, editor } = await setup();
    const event = await draft(community.id, editor);
    const save = (expectedUpdatedAt: string, patch: object) =>
      call(router.events.save, { communityId: community.id, eventId: event.id, expectedUpdatedAt, patch }, by(editor));

    const saved = await save(event.updatedAt, { name: "Python y café", topics: ["lenguajes"], capacity: 40 });

    expect(saved).toMatchObject({ name: "Python y café", topics: ["lenguajes"], capacity: 40 });
    await expect(save(event.updatedAt, { name: "Pisado" })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "stale" },
    });
    await expect(save(saved.updatedAt, { onlineUrl: "http://meet.example.com/abc" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("publishing needs a name, a summary and a reserved date; then it's public under its own address", async () => {
    const { community, editor } = await setup();
    const event = await draft(community.id, editor);
    const publish = () => call(router.events.publish, { communityId: community.id, eventId: event.id }, by(editor));

    await expect(publish()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const held = await call(
      router.events.hold,
      { communityId: community.id, eventId: event.id, day: "2029-12-04", startTime: "19:00", durationMin: 120 },
      by(editor)
    );
    await call(
      router.events.save,
      {
        communityId: community.id,
        eventId: event.id,
        expectedUpdatedAt: held.updatedAt,
        patch: { name: "Cierre del año", summary: "Charlas cortas y brindis" },
      },
      by(editor)
    );

    const result = await publish();

    expect(result).toMatchObject({
      path: `/comunidad/${community.slug}/events/cierre-del-ano`,
      event: { status: "published", heldUntil: null, slug: "cierre-del-ano" },
    });
    await expect(call(router.openSpaces.get, { id: event.id }, by(null))).resolves.toMatchObject({
      name: "Cierre del año",
    });
    await expect(publish()).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "not_draft" } });
  });

  test("a published event moves its date (attendees' invites update) and only admins cancel it", async () => {
    const { community, editor, admin } = await setup();
    const event = await makeEvent(community.id, { status: "published", startDate: new Date("2029-12-04T22:00:00Z") });
    const editable = await call(router.events.get, { communityId: community.id, eventId: event.id }, by(editor));

    const moved = await call(
      router.events.save,
      {
        communityId: community.id,
        eventId: event.id,
        expectedUpdatedAt: editable.updatedAt,
        patch: { schedule: { day: "2029-12-11", startTime: "18:30", durationMin: 90 } },
      },
      by(editor)
    );

    expect(moved).toMatchObject({ startDate: "2029-12-11T21:30:00.000Z", endDate: "2029-12-11T23:00:00.000Z" });
    await expect(
      call(router.events.cancel, { communityId: community.id, eventId: event.id }, by(editor))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.events.cancel, { communityId: community.id, eventId: event.id, reason: "Sin lugar" }, by(admin))
    ).resolves.toMatchObject({ status: "cancelled" });
  });
});

describe("the public page", () => {
  test("shows published events only, never the online link, and the address only when the host allows", async () => {
    const community = await makeCommunity({ name: "Comunidad pública" });
    const hidden = await makeVenue({ name: "Sala privada", addressVisibility: "attendees" });
    const event = await makeEvent(community.id, {
      status: "published",
      mode: "hibrido",
      venueId: hidden.id,
      onlineUrl: "https://meet.example.com/secreto",
      registration: "owu",
      capacity: 3,
    });
    const draft = await makeEvent(community.id, { status: "draft" });
    await makeRsvp(event.id, { guests: 1 });
    const read = (eventSlug: string) =>
      call(router.events.public, { communitySlug: community.slug, eventSlug }, by(null));

    const page = await read(event.slug);

    expect(page).toMatchObject({
      place: { name: "Sala privada", address: null, area: "Cordón, Montevideo" },
      taken: 2,
    });
    expect(JSON.stringify(page)).not.toContain("secreto");
    await expect(read(draft.slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("an open-space event with slots says it has a board", async () => {
    const { community, event } = await makeBoard();

    await expect(
      call(router.events.public, { communitySlug: community.slug, eventSlug: event.slug }, by(null))
    ).resolves.toMatchObject({ hasBoard: true, registration: "none" });
  });
});

/** A draft with everything required, its date reserved `days` ahead */
async function readyDraft(days = 40) {
  const { community, editor } = await setup();
  const event = await draft(community.id, editor);
  const day = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const held = await call(
    router.events.hold,
    { communityId: community.id, eventId: event.id, day, startTime: "19:00", durationMin: 120 },
    by(editor)
  );
  const patch = { name: "Meetup programado", summary: "Charlas cortas" };
  const ready = await call(
    router.events.save,
    { communityId: community.id, eventId: event.id, expectedUpdatedAt: held.updatedAt, patch },
    by(editor)
  );

  return { community, editor, event: ready, ref: { communityId: community.id, eventId: event.id } };
}

describe("publishing later and announcing", () => {
  test("a scheduled draft publishes itself when its time comes", async () => {
    const { editor, ref } = await readyDraft();
    const schedule = (publishAt: string | null) =>
      call(router.events.schedulePublish, { ...ref, publishAt }, by(editor));

    await expect(schedule(new Date(Date.now() - 60_000).toISOString())).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const scheduled = await schedule(new Date(Date.now() + 3_600_000).toISOString());
    await db
      .update(events)
      .set({ publishAt: new Date(Date.now() - 1000) })
      .where(eq(events.id, ref.eventId));

    await Effect.runPromiseWith(liveServices)(publishDue);

    expect(scheduled.publishAt).not.toBeNull();
    await expect(call(router.events.get, ref, by(editor))).resolves.toMatchObject({
      status: "published",
      publishAt: null,
    });
  });

  test("a schedule that can't publish any more is dropped and says why", async () => {
    const { editor, ref } = await readyDraft();
    await call(
      router.events.schedulePublish,
      { ...ref, publishAt: new Date(Date.now() + 3_600_000).toISOString() },
      by(editor)
    );
    await db
      .update(events)
      .set({ summary: null, publishAt: new Date(Date.now() - 1000) })
      .where(eq(events.id, ref.eventId));

    await Effect.runPromiseWith(liveServices)(publishDue);

    await expect(call(router.events.get, ref, by(editor))).resolves.toMatchObject({ status: "draft", publishAt: null });
    await expect(
      db
        .select()
        .from(activity)
        .where(and(eq(activity.eventId, ref.eventId), eq(activity.verb, "event.schedule_failed")))
    ).resolves.toHaveLength(1);
  });

  test("a schedule whose author stopped organizing the community doesn't publish", async () => {
    const { community, editor, ref } = await readyDraft();
    await call(
      router.events.schedulePublish,
      { ...ref, publishAt: new Date(Date.now() + 3_600_000).toISOString() },
      by(editor)
    );
    await db
      .update(events)
      .set({ publishAt: new Date(Date.now() - 1000) })
      .where(eq(events.id, ref.eventId));
    await db
      .update(communityMembers)
      .set({ role: "member" })
      .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, editor.id)));

    await Effect.runPromiseWith(liveServices)(publishDue);

    await expect(db.select().from(events).where(eq(events.id, ref.eventId))).resolves.toMatchObject([
      { status: "draft", publishAt: null },
    ]);
  });

  test("Owy's announcement is written from the event, escaped for Slack, on each channel asked for once", async () => {
    const { editor, event, ref } = await readyDraft();
    const patch = {
      name: "Meetup <!channel> & más",
      announcement: { channels: ["slack", "telegram", "slack"] as ("slack" | "telegram")[] },
    };
    await call(router.events.save, { ...ref, expectedUpdatedAt: event.updatedAt, patch }, by(editor));

    await call(router.events.publish, ref, by(editor));

    const queued = await db.select().from(outboundMessages).where(eq(outboundMessages.eventId, ref.eventId));
    const body = new Map(queued.map((row) => [row.channel, row.body]));
    expect(queued).toHaveLength(2);
    expect(body.get("slack")).toContain("Meetup &lt;!channel&gt; &amp; más");
    expect(body.get("telegram")).toMatch(/^📣 Comunidad del asistente: Meetup <!channel> & más\nCharlas cortas\n/);
  });
});
