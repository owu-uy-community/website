import { call } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeSiteAdmin, makeUser } from "test/factories";

const sections = {
  events: [
    {
      title: "Ruby Montevideo Meetup",
      group: "Ruby Montevideo",
      start: "2026-10-22T19:00:00-03:00",
      venue: "Effectus Software",
      url: "https://www.meetup.com/ruby-montevideo/events/1/",
    },
  ],
  threads: [
    {
      channel: "frontend",
      title: "Cómo testean componentes",
      permalink: "https://owu.slack.com/archives/C1/p1",
      replies: 23,
    },
  ],
  jobs: { count: 4, channelUrl: "https://owu.slack.com/archives/C2" },
  newCommunities: [],
};

// Every test owns its own Monday, so they never collide on the one-issue-per-week rule
let week = Date.UTC(2030, 0, 7);
const nextMonday = () => {
  week += 7 * 86_400_000;

  return new Date(week).toISOString().slice(0, 10);
};

const draft = (weekStart: string, title = "Semana movida") => ({
  weekStart,
  title,
  intro: "Hola, comunidad.",
  sections,
});

describe("semanario", () => {
  test("Owy's draft for a week is rewritten while it is still a draft, and nobody else sees it", async () => {
    const staff = await makeSiteAdmin();
    const owy = by(staff, { apiKey: true });
    const weekStart = nextMonday();

    const first = await call(router.semanario.saveDraft, draft(weekStart), owy);
    const second = await call(router.semanario.saveDraft, draft(weekStart, "Semana tranquila"), owy);
    const published = await call(router.semanario.list, undefined, by(null));

    expect(second).toMatchObject({ id: first.id, title: "Semana tranquila", status: "draft", number: null });
    expect(published.map((issue) => issue.title)).not.toContain("Semana tranquila");
  });

  test("publishing numbers the issue, signs the reviewer and links it to its neighbours", async () => {
    const staff = await makeSiteAdmin({ name: "Ana del staff" });
    const owy = by(staff, { apiKey: true });
    const older = await call(router.semanario.saveDraft, draft(nextMonday(), "Primero"), owy);
    const newer = await call(router.semanario.saveDraft, draft(nextMonday(), "Segundo"), owy);

    const a = await call(router.semanario.publish, { id: older.id }, by(staff));
    const b = await call(router.semanario.publish, { id: newer.id }, by(staff));
    const issue = await call(router.semanario.get, { number: b.number! }, by(null));
    const list = await call(router.semanario.list, undefined, by(null));

    expect(b.number).toBe(a.number! + 1);
    expect(issue).toMatchObject({ title: "Segundo", reviewedBy: "Ana del staff", prev: a.number, next: null });
    expect(list[0]).toMatchObject({ number: b.number, counts: { events: 1, threads: 1, jobs: 4 } });
  });

  test("a re-run never overwrites a published week, and only a person publishes", async () => {
    const staff = await makeSiteAdmin();
    const owy = by(staff, { apiKey: true });
    const weekStart = nextMonday();
    const saved = await call(router.semanario.saveDraft, draft(weekStart), owy);

    await expect(call(router.semanario.publish, { id: saved.id }, owy)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await call(router.semanario.publish, { id: saved.id }, by(staff));
    await expect(call(router.semanario.saveDraft, draft(weekStart, "Pisado"), owy)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  test("unpublishing hides an issue and publishing it again keeps its number", async () => {
    const staff = await makeSiteAdmin();
    const saved = await call(router.semanario.saveDraft, draft(nextMonday()), by(staff, { apiKey: true }));
    const { number } = await call(router.semanario.publish, { id: saved.id }, by(staff));

    await call(router.semanario.unpublish, { id: saved.id }, by(staff));
    await expect(call(router.semanario.get, { number: number! }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const again = await call(router.semanario.publish, { id: saved.id }, by(staff));

    expect(again.number).toBe(number);
  });

  test("only site staff write, and the input keeps its shape", async () => {
    const staff = await makeSiteAdmin();
    const user = await makeUser();

    await expect(call(router.semanario.saveDraft, draft(nextMonday()), by(user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.semanario.listAll, undefined, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    // Not a Monday
    await expect(call(router.semanario.saveDraft, draft("2030-06-04"), by(staff))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // Thread links only point into Slack
    const offsite = { ...sections, threads: [{ ...sections.threads[0], permalink: "https://evil.example/p1" }] };
    await expect(
      call(router.semanario.saveDraft, { ...draft(nextMonday()), sections: offsite }, by(staff))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
