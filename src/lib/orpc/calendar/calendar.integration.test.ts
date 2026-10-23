import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test } from "vitest";

import { EXTERNAL_SERVICES } from "app/lib/constants";
import { db } from "lib/db";
import { communities, type RecurringSlot } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember } from "test/factories";
import { server } from "test/msw/server";

// Far ahead, on plain Tuesdays to Thursdays: nothing else the suite makes lands here.
const MONTH = "2029-06";
const at = (day: string, time = "19:00") => new Date(`${day}T${time}:00-03:00`);

/** Two communities with the same audience (a topic only they use) and one with another. */
async function setup() {
  const topic = `t-${createId().slice(0, 8)}`;
  const [ours, similar, unrelated] = await Promise.all([
    makeCommunity({ name: "Nuestra", topics: [topic], listed: true }),
    makeCommunity({ name: "Parecida", topics: [topic], listed: true, feedNames: [`Parecida en Meetup ${topic}`] }),
    makeCommunity({ name: "Otra cosa", topics: [`o-${topic}`], listed: true }),
  ]);
  const editor = await makeMember(ours.id, "editor");

  return { topic, ours, similar, unrelated, editor };
}

const plan = (communityId: string, actor: Parameters<typeof by>[0]) =>
  call(router.calendar.plan, { communityId, month: MONTH }, by(actor));

describe("calendar.plan", () => {
  let feed: unknown[] = [];
  beforeEach(() => {
    feed = [];
    server.use(http.get(EXTERNAL_SERVICES.meetupBot, () => HttpResponse.json({ meetups: feed })));
  });

  test("is for the community's organizers", async () => {
    const { ours } = await setup();
    const member = await makeMember(ours.id, "member");

    await expect(plan(ours.id, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(plan(ours.id, null)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("another community's event costs more than its hold, and the hold shows without its title", async () => {
    const { ours, similar, unrelated, editor } = await setup();
    await makeEvent(similar.id, {
      name: "Meetup de junio",
      startDate: at("2029-06-12"),
      endDate: at("2029-06-12", "21:00"),
    });
    await makeEvent(similar.id, {
      name: "Algo secreto",
      status: "draft",
      heldUntil: new Date(Date.now() + 86_400_000),
      startDate: at("2029-06-13"),
      endDate: at("2029-06-13", "21:00"),
    });
    await makeEvent(unrelated.id, { name: "Lejos", startDate: at("2029-06-14"), endDate: at("2029-06-14", "21:00") });

    const result = await plan(ours.id, editor);
    const day = (key: string) => result.days.find((entry) => entry.day === key);

    expect(result.items.filter((item) => !item.related).map((item) => item.title)).toContain("Lejos");
    expect(result.items.filter((item) => item.communitySlug === similar.slug)).toMatchObject([
      { title: "Meetup de junio", kind: "event", related: true },
      { title: null, kind: "hold", related: true },
    ]);
    expect(day("2029-06-12")?.reasons.map((reason) => reason.text)).toContain("Mismo horario que Parecida");
    expect(day("2029-06-13")?.reasons.map((reason) => reason.text)).toContain(
      "Reserva tentativa de Parecida a la misma hora"
    );
    expect(day("2029-06-12")!.score).toBeLessThan(day("2029-06-13")!.score);
  });

  test("our own hold isn't a clash; the feed's copy of a known meetup counts once", async () => {
    const { topic, ours, similar, editor } = await setup();
    await makeEvent(ours.id, {
      status: "draft",
      heldUntil: new Date(Date.now() + 86_400_000),
      startDate: at("2029-06-19"),
      endDate: at("2029-06-19", "21:00"),
    });
    await makeEvent(similar.id, { name: "En OWU", startDate: at("2029-06-20"), endDate: at("2029-06-20", "21:00") });
    feed = [
      {
        id: 1,
        name: `Parecida en Meetup ${topic}`,
        title: "En Meetup",
        datetime: "2029-06-20T19:30",
        event_url: "https://www.meetup.com/x/1",
      },
      {
        id: 2,
        name: `Parecida en Meetup ${topic}`,
        title: "Solo en Meetup",
        datetime: "2029-06-21T19:00",
        event_url: "https://www.meetup.com/x/2",
      },
    ];

    const result = await plan(ours.id, editor);

    expect(result.days.find((entry) => entry.day === "2029-06-19")?.reasons.map((reason) => reason.tone)).not.toContain(
      "bad"
    );
    expect(result.items.filter((item) => item.communitySlug === similar.slug).map((item) => item.title)).toStrictEqual([
      "En OWU",
      "Solo en Meetup",
    ]);
    expect(result.items.find((item) => item.title === "Solo en Meetup")?.url).toBe("https://www.meetup.com/x/2");
  });

  test("another community's usual day weighs softly, ours is a hint; a paused one's doesn't count", async () => {
    const { ours, similar, unrelated, editor } = await setup();
    const usual = (communityId: string, slot: Omit<RecurringSlot, "time" | "durationMin">, paused = false) =>
      db
        .update(communities)
        .set({ recurringSlot: { ...slot, time: "19:00", durationMin: 120 }, ...(paused ? { status: "pausa" } : {}) })
        .where(eq(communities.id, communityId));
    // June 2029: the 2nd Tuesday is the 12th, the last Thursday the 28th, the 1st Wednesday the 6th
    await usual(similar.id, { weekday: 2, nth: 2 });
    await usual(ours.id, { weekday: 4, nth: -1 });
    await usual(unrelated.id, { weekday: 3, nth: 1 }, true);

    const result = await plan(ours.id, editor);
    const reasons = (day: string) =>
      result.days.find((entry) => entry.day === day)?.reasons.map((reason) => reason.text);

    expect(reasons("2029-06-12")).toContain("Suele ser el día de Parecida");
    expect(reasons("2029-06-28")).toContain("Es su día habitual (último jueves · 19:00)");
    expect(result.slots).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ day: "2029-06-12", communitySlug: similar.slug, own: false }),
        expect.objectContaining({ day: "2029-06-28", communitySlug: ours.slug, own: true }),
      ])
    );
    // A paused community's habit doesn't count
    expect(result.slots.map((slot) => slot.communitySlug)).not.toContain(unrelated.slug);
    expect(result.suggestions[0]?.day).toBe("2029-06-28");
  });

  test("without a start time, the days are scored for the community's usual one (19:00 without any)", async () => {
    const { ours, editor } = await setup();
    const fresh = await setup();
    for (const day of ["2026-03-10", "2026-04-14", "2026-05-12"]) {
      await makeEvent(ours.id, { status: "published", startDate: at(day, "18:30"), endDate: at(day, "20:30") });
    }
    await makeEvent(ours.id, { status: "published", startDate: at("2026-06-09"), endDate: at("2026-06-09", "21:00") });

    await expect(plan(ours.id, editor)).resolves.toMatchObject({ usualStart: "18:30", startTime: "18:30" });
    await expect(
      call(router.calendar.plan, { communityId: ours.id, month: MONTH, startTime: "10:00" }, by(editor))
    ).resolves.toMatchObject({ usualStart: "18:30", startTime: "10:00" });
    await expect(plan(fresh.ours.id, fresh.editor)).resolves.toMatchObject({ usualStart: "19:00", startTime: "19:00" });
  });
});
