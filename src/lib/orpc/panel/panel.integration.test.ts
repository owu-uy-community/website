import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test } from "vitest";

import { EXTERNAL_SERVICES } from "app/lib/constants";
import { dayKey } from "lib/community/time";
import { db } from "lib/db";
import {
  activity,
  auditLog,
  communityFollowers,
  eventHosts,
  staffTaskAssignments,
  staffTasks,
  venueRequests,
} from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp, makeUser, makeVenue } from "test/factories";
import { server } from "test/msw/server";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** A Montevideo day `days` from now, and an instant on it. */
const inDays = (days: number) => dayKey(new Date(Date.now() + days * DAY_MS));
const at = (day: string, time = "19:00") => new Date(`${day}T${time}:00-03:00`);
const evening = (day: string) => ({ startDate: at(day), endDate: at(day, "21:00") });

/** Ours, one with the same audience (a topic only they use) and one with another; unique names. */
async function setup() {
  const topic = `t-${createId().slice(0, 8)}`;
  const tag = createId().slice(0, 6);
  const [ours, similar, unrelated] = await Promise.all([
    makeCommunity({ name: `Nuestra ${tag}`, topics: [topic] }),
    makeCommunity({ name: `Parecida ${tag}`, topics: [topic] }),
    makeCommunity({ name: `Otra cosa ${tag}`, topics: [`o-${topic}`] }),
  ]);
  const editor = await makeMember(ours.id, "editor");

  return { ours, similar, unrelated, editor };
}

const summary = (communityId: string, actor: Parameters<typeof by>[0]) =>
  call(router.panel.summary, { communityId }, by(actor));

describe("panel.summary", () => {
  beforeEach(() => {
    server.use(http.get(EXTERNAL_SERVICES.meetupBot, () => HttpResponse.json({ meetups: [] })));
  });

  test("is for the community's organizers", async () => {
    const { ours, similar } = await setup();
    const member = await makeMember(ours.id, "member");
    const otherEditor = await makeMember(similar.id, "editor");

    await expect(summary(ours.id, null)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(summary(ours.id, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(summary(ours.id, otherEditor)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("the next event with its seats, the drafts, followers and this year's count", async () => {
    const { ours, editor } = await setup();
    const later = await makeEvent(ours.id, { name: "Después", status: "published", ...evening(inDays(30)) });
    const next = await makeEvent(ours.id, {
      name: "El próximo",
      status: "published",
      capacity: 60,
      ...evening(inDays(9)),
    });
    await makeRsvp(next.id, { guests: 1 });
    await makeRsvp(next.id, { status: "waitlisted" });
    const draft = await makeEvent(ours.id, { name: "Sin fecha", status: "draft" });
    await db.insert(communityFollowers).values({ communityId: ours.id, userId: (await makeUser()).id });

    const result = await summary(ours.id, editor);

    expect(result.ahead.map((event) => event.id)).toStrictEqual([next.id, later.id]);
    expect(result.nextSeats).toStrictEqual({ taken: 2, waiting: 1 });
    expect(result.drafts.map((event) => event.id)).toStrictEqual([draft.id]);
    expect(result).toMatchObject({ followers: 1, showUp: { rate: null, events: 0 } });
    expect(result.publishedThisYear).toBe(
      [next, later].filter((event) => dayKey(event.startDate).slice(0, 4) === inDays(0).slice(0, 4)).length
    );
  });

  test("what waits for an answer: a poll, a co-host invitation, a silent host and a fresh answer", async () => {
    const { ours, similar, editor } = await setup();
    const asker = await makeMember(similar.id, "editor");
    const poll = await call(
      router.polls.create,
      { communityId: similar.id, title: "Meetup conjunto", days: [inDays(20), inDays(21)], invited: [ours.id] },
      by(asker)
    );
    const hosted = await makeEvent(similar.id, { name: "Juntos", status: "published", ...evening(inDays(25)) });
    await db.insert(eventHosts).values({ eventId: hosted.id, communityId: ours.id, status: "invited" });
    const venue = await makeVenue();
    const request = (status: "pending" | "accepted" | "declined", hoursAgo: number, answeredHoursAgo?: number) => ({
      venueId: venue.id,
      communityId: ours.id,
      options: [{ start: at(inDays(15)).toISOString(), end: at(inDays(15), "21:00").toISOString() }],
      expectedAttendees: 40,
      status,
      createdAt: new Date(Date.now() - hoursAgo * HOUR_MS),
      expiresAt: new Date(Date.now() + (72 - hoursAgo) * HOUR_MS),
      respondedAt: answeredHoursAgo === undefined ? null : new Date(Date.now() - answeredHoursAgo * HOUR_MS),
    });
    const [silent, , answered] = await db
      .insert(venueRequests)
      .values([
        request("pending", 50),
        request("pending", 5),
        request("accepted", 30, 2),
        request("declined", 200, 150),
      ])
      .returning();

    const result = await summary(ours.id, editor);

    expect(result.polls).toStrictEqual([{ id: poll.id, title: "Meetup conjunto", asker: similar.name }]);
    expect(result.invitations).toMatchObject([{ eventId: hosted.id, host: similar.name }]);
    expect(result.venueRequests.map((row) => [row.id, row.status])).toStrictEqual([
      [answered.id, "accepted"],
      [silent.id, "pending"],
    ]);
  });

  test("a clash names what the calendar shows: another community's hold, never its title", async () => {
    const { ours, similar, unrelated, editor } = await setup();
    const [eventDay, holdDay] = [inDays(12), inDays(19)];
    const ourEvent = await makeEvent(ours.id, { name: "Nuestro meetup", status: "published", ...evening(eventDay) });
    const ourHold = await makeEvent(ours.id, {
      name: "Nuestra reserva",
      status: "draft",
      heldUntil: new Date(Date.now() + 10 * DAY_MS),
      ...evening(holdDay),
    });
    await makeEvent(similar.id, {
      name: "Algo secreto",
      status: "draft",
      heldUntil: new Date(Date.now() + 10 * DAY_MS),
      ...evening(eventDay),
    });
    await makeEvent(similar.id, { name: "Su meetup", status: "published", ...evening(holdDay) });
    await makeEvent(unrelated.id, { name: "Lejos", status: "published", ...evening(eventDay) });

    const result = await summary(ours.id, editor);
    const ourClashes = result.conflicts.filter((clash) =>
      [similar.name, unrelated.name].includes(clash.other.communityName)
    );

    expect(ourClashes).toMatchObject([
      { eventId: ourEvent.id, day: eventDay, other: { communityName: similar.name, title: null, kind: "hold" } },
      { eventId: ourHold.id, day: holdDay, other: { communityName: similar.name, title: "Su meetup", kind: "event" } },
    ]);
    expect(JSON.stringify(result)).not.toContain("Algo secreto");
  });

  test("the team's activity covers this community's events only", async () => {
    const { ours, similar, editor } = await setup();
    const [mine, theirs] = await Promise.all([
      makeEvent(ours.id, { name: "Nuestro", status: "published" }),
      makeEvent(similar.id, { name: "De ellos", status: "published" }),
    ]);
    await db.insert(activity).values([
      { eventId: mine.id, actorId: editor.id, verb: "event.published", entityType: "event", summary: "publicó" },
      { eventId: theirs.id, verb: "event.published", entityType: "event", summary: "publicó lo de ellos" },
    ]);

    const result = await summary(ours.id, editor);

    expect(result.activity).toMatchObject([
      { eventId: mine.id, eventName: "Nuestro", summary: "publicó", actor: { id: editor.id, name: editor.name } },
    ]);
  });

  test("what Inicio weighs: the last event, the team, a close-out, seats ahead and my tasks", async () => {
    const { ours, editor } = await setup();
    const [quiet, otherEditor] = await Promise.all([makeMember(ours.id, "admin"), makeMember(ours.id, "editor")]);
    await makeMember(ours.id, "member");
    const past = await makeEvent(ours.id, {
      name: "El de la semana pasada",
      status: "published",
      ...evening(inDays(-5)),
    });
    const closed = await makeEvent(ours.id, {
      name: "Cerrado",
      status: "published",
      closedOutAt: new Date(),
      ...evening(inDays(-3)),
    });
    await makeEvent(ours.id, { name: "Hace mucho", status: "published", ...evening(inDays(-40)) });
    const next = await makeEvent(ours.id, {
      name: "El próximo",
      status: "published",
      registration: "owu",
      capacity: 60,
      ...evening(inDays(6)),
    });
    await makeRsvp(next.id, { guests: 2 });
    await makeRsvp(next.id, { status: "offered" });
    await makeRsvp(next.id, { status: "waitlisted" });
    // Active: the editor through an event, the other editor through the community's audit log; the admin did nothing
    await db.insert(activity).values({
      eventId: next.id,
      actorId: editor.id,
      verb: "event.updated",
      entityType: "event",
      summary: "cambió algo",
    });
    await db
      .insert(auditLog)
      .values({ actorId: otherEditor.id, via: "session", action: "member.update", communityId: ours.id });
    const [task, later] = await db
      .insert(staffTasks)
      .values([
        { openSpaceId: next.id, title: "Pedir las pizzas", dayDate: at(inDays(1), "00:00") },
        { openSpaceId: next.id, title: "Para más adelante", dayDate: at(inDays(4), "00:00") },
      ])
      .returning();
    await db.insert(staffTaskAssignments).values([
      { taskId: task.id, userId: editor.id },
      { taskId: later.id, userId: editor.id },
      { taskId: task.id, userId: quiet.id },
    ]);

    const result = await summary(ours.id, editor);

    expect({ lastEventAt: result.lastEventAt, team: result.team }).toStrictEqual({
      lastEventAt: closed.startDate.toISOString(),
      team: { size: 4, activeOrganizers: 2 },
    });
    expect(result.closeOut).toStrictEqual([
      { id: past.id, name: "El de la semana pasada", endDate: past.endDate.toISOString() },
    ]);
    expect(result.seats).toStrictEqual({ [next.id]: 4 });
    expect(result.myTasks).toStrictEqual([
      { id: task.id, title: "Pedir las pizzas", eventId: next.id, eventName: "El próximo", day: inDays(1) },
    ]);
    expect(result.community).toMatchObject({ status: "activa", recurringSlot: null, topics: ours.topics });
  });
});
