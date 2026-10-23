import { call } from "@orpc/server";
import { eq, like } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { CONDUCT_EMAIL } from "lib/community/site";
import { db } from "lib/db";
import { communityMembers, emailDeliveries, incidents } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeSiteAdmin, makeUser } from "test/factories";

const DAY = 86_400_000;

async function setup() {
  const community = await makeCommunity({ name: "Comunidad con código" });
  const [owner, admin, editor, responder, second, member] = await Promise.all([
    makeMember(community.id, "owner"),
    makeMember(community.id, "admin"),
    makeMember(community.id, "editor"),
    makeMember(community.id, "editor", { name: "Ana Responsable" }),
    makeMember(community.id, "editor", { name: "Beto Segundo" }),
    makeMember(community.id, "member"),
  ]);
  const start = new Date(Date.now() + 10 * DAY);
  const event = await makeEvent(community.id, {
    name: "Meetup con código",
    status: "published",
    startDate: start,
    endDate: new Date(start.getTime() + 2 * 3_600_000),
  });

  return { community, owner, admin, editor, responder, second, member, event };
}

/** Who the report's emails went to */
const mailedTo = (incidentId: string) =>
  db
    .select({ to: emailDeliveries.to })
    .from(emailDeliveries)
    .where(like(emailDeliveries.dedupeKey, `conduct_report:${incidentId}:%`))
    .then((rows) => rows.map((row) => row.to).toSorted());

describe("conduct responders", () => {
  test("only people on the team with editor or more can be named, up to three", async () => {
    const { community, editor, responder, member, event } = await setup();
    const stranger = await makeUser();
    const set = (userIds: string[]) => call(router.conduct.setResponders, { eventId: event.id, userIds }, by(editor));

    await expect(set([stranger.id])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(set([member.id])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(set([responder.id])).resolves.toMatchObject({ responders: [responder.id] });

    const page = await call(router.events.public, { communitySlug: community.slug, eventSlug: event.slug }, by(null));
    expect(page.responders).toStrictEqual(["Ana R."]);
  });

  test("a member of the team can't name responders", async () => {
    const { community, member, responder, event } = await setup();

    await expect(
      call(router.conduct.setResponders, { eventId: event.id, userIds: [responder.id] }, by(member))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("publishing an event for more than 60 needs two responders; scheduling it too", async () => {
    const { community, editor, responder, second } = await setup();
    const start = new Date(Date.now() + 20 * DAY);
    const draft = await makeEvent(community.id, {
      name: "Meetup grande",
      summary: "Muchas charlas",
      status: "draft",
      heldUntil: new Date(Date.now() + 7 * DAY),
      registration: "owu",
      capacity: 61,
      responders: [responder.id],
      startDate: start,
      endDate: new Date(start.getTime() + 2 * 3_600_000),
    });
    const ref = { communityId: community.id, eventId: draft.id };

    await expect(call(router.events.publish, ref, by(editor))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("responsables de conducta"),
    });
    await expect(
      call(router.events.schedulePublish, { ...ref, publishAt: new Date(Date.now() + DAY).toISOString() }, by(editor))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await call(router.conduct.setResponders, { eventId: draft.id, userIds: [responder.id, second.id] }, by(editor));
    await expect(call(router.events.publish, ref, by(editor))).resolves.toMatchObject({
      event: { status: "published" },
    });
  });
});

describe("conduct reports", () => {
  const report = (community: { slug: string }, event: { slug: string }, extra: object = {}) =>
    call(
      router.conduct.report,
      {
        communitySlug: community.slug,
        eventSlug: event.slug,
        description: "Alguien hizo comentarios fuera de lugar",
        ...extra,
      },
      by(null)
    );
  const lastIncident = (eventId: string) =>
    db
      .select()
      .from(incidents)
      .where(eq(incidents.eventId, eventId))
      .then((rows) => rows.at(-1)!);

  test("an anonymous report goes to the event's responders and to OWU's conduct team", async () => {
    const { community, editor, responder, second, event } = await setup();
    await call(router.conduct.setResponders, { eventId: event.id, userIds: [responder.id, second.id] }, by(editor));

    await expect(report(community, event, { where: "Afuera, en el break" })).resolves.toStrictEqual({
      ok: true,
      to: "both",
    });

    const incident = await lastIncident(event.id);
    expect(incident).toMatchObject({
      category: "conduct",
      sensitive: true,
      source: "public",
      reporterId: null,
      reporterContact: null,
      involvesOrganizer: false,
      location: "Afuera, en el break",
    });
    await expect(mailedTo(incident.id)).resolves.toStrictEqual(
      [responder.email, second.email, CONDUCT_EMAIL].toSorted()
    );
  });

  test("a report that names someone on the team goes to OWU only, and no one on the team reads it", async () => {
    const { community, editor, admin, owner, responder, event } = await setup();
    await call(router.conduct.setResponders, { eventId: event.id, userIds: [responder.id] }, by(editor));
    await expect(
      report(community, event, { involvesOrganizer: true, contact: "anon@example.com" })
    ).resolves.toStrictEqual({
      ok: true,
      to: "owu",
    });

    const incident = await lastIncident(event.id);
    await expect(mailedTo(incident.id)).resolves.toStrictEqual([CONDUCT_EMAIL]);
    const [toConduct] = await db
      .select({ text: emailDeliveries.text })
      .from(emailDeliveries)
      .where(eq(emailDeliveries.dedupeKey, `conduct_report:${incident.id}:${CONDUCT_EMAIL}`));
    expect(toConduct.text).toContain("Involucra a alguien de la organización");

    // The responder, the community's owner and admin: none of them reads it
    for (const person of [responder, owner, admin]) {
      const seen = await call(router.conduct.reports, { eventId: event.id }, by(person)).then(
        (result) => result.reports.map((item) => item.id),
        () => []
      );
      expect(seen).not.toContain(incident.id);
    }
    // OWU's staff do, unless they are on that team themselves
    const [staff, staffOnTeam] = await Promise.all([makeSiteAdmin(), makeSiteAdmin()]);
    await db.insert(communityMembers).values({ communityId: community.id, userId: staffOnTeam.id, role: "editor" });
    const onTeam = await call(router.conduct.reports, { eventId: event.id }, by(staffOnTeam));
    expect(onTeam.reports.map((item) => item.id)).not.toContain(incident.id);
    const read = await call(router.conduct.reports, { eventId: event.id }, by(staff));
    expect(read).toMatchObject({
      as: "staff",
      reports: [{ id: incident.id, involvesOrganizer: true, contact: "anon@example.com" }],
    });
  });

  test("responders and staff read reports; another editor, the admin and the owner can't", async () => {
    const { community, editor, admin, owner, responder, event } = await setup();
    await call(router.conduct.setResponders, { eventId: event.id, userIds: [responder.id] }, by(editor));
    await report(community, event);
    const incident = await lastIncident(event.id);

    await expect(call(router.conduct.reports, { eventId: event.id }, by(responder))).resolves.toMatchObject({
      as: "responder",
      reports: [{ id: incident.id, description: "Alguien hizo comentarios fuera de lugar", status: "open" }],
    });
    for (const person of [editor, admin, owner]) {
      await expect(call(router.conduct.reports, { eventId: event.id }, by(person))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    // Nor through the conf admin's incidents: only site staff see public reports there
    const listed = await call(router.incidents.list, { eventId: event.id }, by(admin));
    expect(listed.map((item) => item.id)).not.toContain(incident.id);
    const staff = await makeSiteAdmin();
    await expect(call(router.conduct.reports, { eventId: event.id }, by(staff))).resolves.toMatchObject({
      as: "staff",
    });

    // A responder works it: a note, then resolved, both in its log
    await call(
      router.conduct.addNote,
      { eventId: event.id, id: incident.id, body: "Hablé con la persona" },
      by(responder)
    );
    const after = await call(
      router.conduct.setStatus,
      { eventId: event.id, id: incident.id, status: "resolved" },
      by(responder)
    );
    expect(after.reports[0]).toMatchObject({
      status: "resolved",
      notes: [
        { body: "Hablé con la persona", author: "Ana Responsable" },
        { body: "cambió el estado a resuelto", author: "Ana Responsable" },
      ],
    });
    await expect(
      call(router.conduct.addNote, { eventId: event.id, id: incident.id, body: "Me meto" }, by(editor))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("a responder taken off the team stops reading them; drafts can't be reported", async () => {
    const { community, editor, responder, event } = await setup();
    await call(router.conduct.setResponders, { eventId: event.id, userIds: [responder.id] }, by(editor));
    const draft = await makeEvent(community.id, { status: "draft" });
    await expect(report(community, draft)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await call(router.communities.members.leave, { communityId: community.id }, by(responder));
    await expect(call(router.conduct.reports, { eventId: event.id }, by(responder))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
