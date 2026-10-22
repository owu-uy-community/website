import { call } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeCommunity, makeEvent, makeMember, makeRsvp, makeVenue } from "test/factories";

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
