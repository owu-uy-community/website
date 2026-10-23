import { call } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { auditLog, surveyResponses, surveys } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp, makeSiteAdmin, makeUser } from "test/factories";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

/**
 * Three past meetups: in August Ana and Beto came (door used); in September Ana came back, Beto
 * didn't and Caro was new (door used); in October, no door, Caro and Dani kept their seat. Plus a
 * follower, a survey and a sensitive answer that must never leave.
 */
async function seed(name = "Comunidad con números") {
  const community = await makeCommunity({ name });
  const [owner, admin, editor] = await Promise.all([
    makeMember(community.id, "owner"),
    makeMember(community.id, "admin"),
    makeMember(community.id, "editor"),
  ]);
  await db
    .insert(auditLog)
    .values({ actorId: editor.id, via: "session", action: "events.save", communityId: community.id });
  const [ana, beto, caro, dani] = await Promise.all(
    ["Ana Asistente", "Beto Asistente", "Caro Asistente", "Dani Asistente"].map((person) => makeUser({ name: person }))
  );
  const meetup = (days: number, title: string, speaker: string) =>
    makeEvent(community.id, {
      name: title,
      status: "published",
      registration: "owu",
      startDate: ago(days + 0.1),
      endDate: ago(days),
      talks: [{ title: "Charla", speaker }],
    });
  const august = await meetup(80, "Meetup de agosto", "Speaker Uno");
  const september = await meetup(50, "Meetup de septiembre", "Speaker Uno");
  const october = await meetup(20, "Meetup de octubre", "Speaker Dos");
  const seat = (eventId: string, person: { id: string; name: string; email: string }, came: boolean) =>
    makeRsvp(eventId, {
      userId: person.id,
      name: person.name,
      email: person.email,
      checkedInAt: came ? new Date() : null,
      answers: { ci: "1.234.567-8" },
    });
  await Promise.all([
    seat(august.id, ana, true),
    seat(august.id, beto, true),
    seat(september.id, ana, true),
    seat(september.id, beto, false),
    seat(september.id, caro, true),
    seat(october.id, caro, false),
    seat(october.id, dani, false),
  ]);
  const [survey] = await db
    .insert(surveys)
    .values({
      eventId: september.id,
      title: "Encuesta",
      questions: [{ id: "nps", kind: "nps", label: "¿Recomendarías?" }],
    })
    .returning();
  await db.insert(surveyResponses).values([
    { surveyId: survey.id, respondent: "a", answers: { nps: 10 } },
    { surveyId: survey.id, respondent: "b", answers: { nps: 6 } },
  ]);
  const follower = await makeUser({ name: "Seguidora Secreta" });
  await call(router.communities.follow, { communityId: community.id, digest: "weekly" }, by(follower));

  return {
    community,
    owner,
    admin,
    editor,
    people: [ana, beto, caro, dani],
    follower,
    events: { august, september, october },
  };
}

describe("insights.community", () => {
  test("the numbers with their counts: who came, first-timers, second visits, speakers, the survey", async () => {
    const { community, editor, events } = await seed();

    const numbers = await call(router.insights.community, { communityId: community.id }, by(editor));

    expect(numbers).toMatchObject({
      health: "activa",
      daysSinceLastEvent: 20,
      followers: 1,
      organizers: { active: 1, total: 3 },
      showRate: { seated: 5, came: 4, events: 2 },
      // Ana, Beto and Caro were new before the last event; Ana and Caro came back
      secondVisit: { firstTimers: 3, returned: 2 },
      returning: { people: 4, before: 2 },
      speakers: { speakers: 2, new: 2, repeat: 0 },
      publicStats: false,
    });
    expect(numbers.events).toStrictEqual([
      expect.objectContaining({ id: events.october.id, seated: 2, came: null, firstTimers: { part: 1, of: 2 } }),
      expect.objectContaining({
        id: events.september.id,
        seated: 3,
        came: 2,
        firstTimers: { part: 1, of: 2 },
        nps: 0,
        responses: 2,
      }),
      expect.objectContaining({ id: events.august.id, seated: 2, came: 2, firstTimers: { part: 2, of: 2 } }),
    ]);
    expect(numbers.quarters).toHaveLength(8);
  });

  test("aggregates only: no name or email of anyone who came or follows", async () => {
    const { community, editor, people, follower } = await seed();

    const text = JSON.stringify(await call(router.insights.community, { communityId: community.id }, by(editor)));

    const leaks = [...people, follower].flatMap((person) => [person.name, person.email]);
    expect(leaks.filter((value) => text.includes(value))).toStrictEqual([]);
  });

  test("members can't read them", async () => {
    const { community } = await seed();
    const member = await makeMember(community.id, "member");

    await expect(call(router.insights.community, { communityId: community.id }, by(member))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("insights.export", () => {
  test("events, attendance counts, the team and the follower count; never followers, attendees or CI", async () => {
    const { community, admin, people, follower } = await seed("Comunidad exportable");

    const data = await call(router.insights.export, { communityId: community.id }, by(admin));

    expect(data.csv.map((file) => file.filename.replace(/-\d{4}-\d{2}-\d{2}/, ""))).toStrictEqual([
      `${community.slug}-eventos.csv`,
      `${community.slug}-asistencia.csv`,
      `${community.slug}-equipo.csv`,
      `${community.slug}-seguidores.csv`,
    ]);
    const [eventsCsv, attendance, team, followers] = data.csv.map((file) => file.content);
    expect([
      eventsCsv.includes("Meetup de agosto"),
      attendance.split("\r\n")[1].includes("Meetup de agosto,2,0,2,2,,0"),
      team.includes(admin.email),
      followers.includes("1,0,1"),
    ]).toStrictEqual([true, true, true, true]);
    const everything = [...data.csv.map((file) => file.content), data.json.content].join("\n");
    const leaks = [...people, follower].flatMap((person) => [person.name, person.email]).concat("1.234.567-8");
    expect(leaks.filter((value) => everything.includes(value))).toStrictEqual([]);
    expect(JSON.parse(data.json.content)).toMatchObject({ followers: { total: 1, weekly: 1 }, team: { size: 3 } });
  });

  test("editors can't export, admins can", async () => {
    const { community, editor } = await seed();

    await expect(call(router.insights.export, { communityId: community.id }, by(editor))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("OWU's numbers", () => {
  test("the public impact page lists only communities that chose to, aggregates only", async () => {
    const shown = await seed("Comunidad que muestra");
    const hidden = await seed("Comunidad reservada");
    await expect(
      call(router.insights.setPublic, { communityId: shown.community.id, publicStats: true }, by(shown.editor))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await call(router.insights.setPublic, { communityId: shown.community.id, publicStats: true }, by(shown.admin));

    const impact = await call(router.insights.impact, undefined, by(null));

    const year = new Date().getFullYear();
    const mine = impact.communities.find((row) => row.slug === shown.community.slug);
    expect(impact.communities.find((row) => row.slug === hidden.community.slug)).toBeUndefined();
    // The three meetups may straddle New Year's: count both years
    expect(mine?.years.reduce((sum, row) => sum + row.events, 0)).toBe(3);
    expect(impact.years[0].year).toBe(year);
    expect(JSON.stringify(impact)).not.toContain("Asistente");
  });

  test("staff see every community at a glance; organizers can't", async () => {
    const { community, admin } = await seed("Comunidad para staff");
    const staff = await makeSiteAdmin();

    const owu = await call(router.insights.owu, undefined, by(staff));

    expect(owu.communities.find((row) => row.id === community.id)).toMatchObject({
      health: "activa",
      events12m: 3,
      came12m: 6,
      organizers: { active: 1, total: 3 },
    });
    await expect(call(router.insights.owu, undefined, by(admin))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
