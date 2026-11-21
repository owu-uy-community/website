import { call } from "@orpc/server";
import { eq, like } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { auditLog, emailDeliveries, venueContacts, venueRequests } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makePlatformUser, makeSiteAdmin, makeVenue } from "test/factories";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

/** A community whose last event ended `days` ago, with organizers active as told */
async function community(days: number, overrides: Parameters<typeof makeCommunity>[0] = {}, active = 2) {
  const row = await makeCommunity({ name: `Comunidad ${days}`, createdAt: ago(1000), ...overrides });
  const people = await Promise.all([
    makeMember(row.id, "owner", { name: "Dueña Activa" }),
    makeMember(row.id, "editor", { name: "Editor Activo" }),
  ]);
  for (const person of people.slice(0, active)) {
    await db
      .insert(auditLog)
      .values({ actorId: person.id, via: "session", action: "events.save", communityId: row.id });
  }
  await makeEvent(row.id, { status: "published", startDate: ago(days + 0.1), endDate: ago(days) });

  return { community: row, people };
}

const queueFor = async (communityId: string) => {
  const staff = await makeSiteAdmin();
  const queue = await call(router.outreach.list, undefined, by(staff));

  return queue.rows.filter((row) => row.community.id === communityId);
};

describe("outreach.list", () => {
  test("dormant and quiet communities show with why and their team; a lively or paused one doesn't", async () => {
    const [dormant, quiet, lively, paused] = await Promise.all([
      community(200),
      community(75),
      community(10),
      community(300, { status: "pausa", pausedUntil: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10) }),
    ]);

    const [dormantRows, quietRows, livelyRows, pausedRows] = await Promise.all(
      [dormant, quiet, lively, paused].map(({ community: row }) => queueFor(row.id))
    );
    expect(dormantRows).toMatchObject([
      {
        reason: "dormida",
        why: "Hace 200 días del último evento, y nada en agenda",
        team: [
          { name: "Dueña Activa", role: "owner", active: true },
          { name: "Editor Activo", role: "editor", active: true },
        ],
        emailedAt: null,
      },
    ]);
    expect(quietRows.map((row) => row.reason)).toStrictEqual(["en-riesgo"]);
    expect(livelyRows).toStrictEqual([]);
    expect(pausedRows).toStrictEqual([]);
  });

  test("one active organizer, an unanswered request and a gone contact each get a row", async () => {
    const { community: row } = await community(10, {}, 1);
    const venue = await makeVenue({ name: "Oficina Callada" });
    await db.insert(venueRequests).values({
      venueId: venue.id,
      communityId: row.id,
      options: [
        { start: new Date(Date.now() + 20 * DAY).toISOString(), end: new Date(Date.now() + 20 * DAY).toISOString() },
      ],
      expectedAttendees: 40,
      createdAt: ago(4),
      expiresAt: new Date(Date.now() + DAY),
    });
    await db
      .update(venueContacts)
      .set({ leftAt: ago(2) })
      .where(eq(venueContacts.venueId, venue.id));

    // The most urgent first
    expect((await queueFor(row.id)).map((item) => item.reason)).toStrictEqual([
      "pedido-sin-respuesta",
      "contacto-viejo",
      "un-organizador",
    ]);
  });

  test("moderators and community admins can't see the queue", async () => {
    const { community: row, people } = await community(200);
    const moderator = await makePlatformUser("moderator");

    await expect(call(router.outreach.list, undefined, by(moderator))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(router.outreach.list, undefined, by(people[0]))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(router.outreach.email, { communityId: row.id, reason: "dormida" }, by(moderator))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("outreach actions", () => {
  test("the templated email goes to the editors and up, once a day, replying to the staff", async () => {
    const { community: row, people } = await community(200);
    await makeMember(row.id, "member");
    const staff = await makeSiteAdmin({ name: "Staff Atento" });

    await expect(
      call(router.outreach.email, { communityId: row.id, reason: "dormida" }, by(staff))
    ).resolves.toStrictEqual({
      sent: 2,
    });
    await call(router.outreach.email, { communityId: row.id, reason: "dormida" }, by(staff));

    const mails = await db
      .select()
      .from(emailDeliveries)
      .where(like(emailDeliveries.dedupeKey, `community_outreach:${row.id}:dormida:%`));
    expect(mails.map((mail) => mail.to).toSorted()).toStrictEqual(people.map((person) => person.email).toSorted());
    expect(mails[0]).toMatchObject({
      subject: `¿Siguen con ${row.name}?`,
      headers: { "Reply-To": staff.email },
      text: expect.stringContaining("Staff Atento, del equipo de OWU"),
    });
    expect((await queueFor(row.id))[0].emailedAt).not.toBeNull();

    // A reason the community doesn't have is refused
    await expect(
      call(router.outreach.email, { communityId: row.id, reason: "en-riesgo" }, by(staff))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("done and snoozed take a row off the queue, with who did it in the log; undo brings it back", async () => {
    const { community: row } = await community(200);
    const staff = await makeSiteAdmin({ name: "Staff Prolijo" });
    const target = { communityId: row.id, reason: "dormida" as const };

    const done = await call(router.outreach.mark, { ...target, status: "done" }, by(staff));
    const { log } = await call(router.outreach.list, undefined, by(staff));
    expect(log.find((entry) => entry.id === done.id)).toMatchObject({
      community: row.name,
      reason: "dormida",
      status: "done",
      by: "Staff Prolijo",
    });
    const afterDone = (await queueFor(row.id)).length;

    await call(router.outreach.undo, { id: done.id }, by(staff));
    const afterUndo = (await queueFor(row.id)).length;

    const snoozed = await call(router.outreach.mark, { ...target, status: "snoozed" }, by(staff));
    expect([afterDone, afterUndo, (await queueFor(row.id)).length]).toStrictEqual([0, 1, 0]);
    // Done keeps it off for 90 days, snoozed for 30
    expect(
      [Date.parse(done.until!) - Date.now(), Date.parse(snoozed.until!) - Date.now()].map((ms) => Math.round(ms / DAY))
    ).toStrictEqual([90, 30]);
  });
});
