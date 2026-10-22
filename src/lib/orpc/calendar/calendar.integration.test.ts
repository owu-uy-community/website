import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test } from "vitest";

import { EXTERNAL_SERVICES } from "app/lib/constants";
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
});
