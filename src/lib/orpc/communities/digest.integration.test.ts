import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, emailSuppressions } from "lib/db/schema";
import { sendDigests } from "lib/orpc/communities/digest";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeUser } from "test/factories";

const DAY = 86_400_000;
const run = Effect.runPromiseWith(liveServices);
const mails = (to: string, kind: string) =>
  db
    .select({ subject: emailDeliveries.subject, text: emailDeliveries.text, headers: emailDeliveries.headers })
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

async function setup() {
  const community = await makeCommunity({ name: "Comunidad semanal" });
  const editor = await makeMember(community.id, "editor");
  const [weekly, each] = await Promise.all([makeUser(), makeUser()]);
  await call(router.communities.follow, { communityId: community.id, digest: "weekly" }, by(weekly));
  await call(router.communities.follow, { communityId: community.id }, by(each));
  const draft = (name: string, inDays: number) => {
    const start = new Date(Date.now() + inDays * DAY);

    return makeEvent(community.id, {
      name,
      summary: "Charlas",
      status: "draft",
      heldUntil: new Date(Date.now() + 7 * DAY),
      registration: "none",
      startDate: start,
      endDate: new Date(start.getTime() + 2 * 3_600_000),
    });
  };

  return { community, editor, weekly, each, draft };
}

describe("the weekly digest", () => {
  test("weekly followers get no per-event mail, then one digest a week with the next two weeks", async () => {
    const { community, editor, weekly, each, draft } = await setup();
    const other = await makeCommunity({ name: "Otra comunidad" });
    const start = new Date(Date.now() + 3 * DAY);
    await makeEvent(other.id, {
      name: "Evento de otra comunidad",
      status: "published",
      startDate: start,
      endDate: new Date(start.getTime() + 3_600_000),
    });
    for (const [name, days] of [
      ["Meetup cercano", 5],
      ["Taller en diez días", 10],
      ["Meetup lejano", 30],
    ] as const) {
      const event = await draft(name, days);
      await call(router.events.publish, { communityId: community.id, eventId: event.id }, by(editor));
    }
    const perEvent = await Promise.all([weekly, each].map((person) => mails(person.email, "follower_new_event")));
    expect(perEvent.map((list) => list.length)).toStrictEqual([0, 3]);

    // Not Monday morning yet: nothing, unless forced
    const tuesday = new Date("2026-10-27T15:00:00Z");
    await expect(run(sendDigests({ now: tuesday }))).resolves.toStrictEqual({ due: false, queued: 0 });
    await run(sendDigests({ force: true }));
    await run(sendDigests({ force: true }));

    const [digests, none] = await Promise.all([weekly, each].map((person) => mails(person.email, "follower_digest")));
    expect([digests.length, none.length]).toStrictEqual([1, 0]);
    expect(digests[0]).toMatchObject({
      subject: "Esta semana en OWU: 2 eventos de las comunidades que seguís",
      headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    // "Y en OWU" picks 3 of every community's events: other test files publish some too, so only its
    // presence is this test's to check
    expect(
      ["Meetup cercano", "Taller en diez días", "Meetup lejano", "Y en OWU:"].map((text) =>
        digests[0].text.includes(text)
      )
    ).toStrictEqual([true, true, false, true]);
  });

  test("nothing ahead, nothing sent; turning follower mail off stops the digest too", async () => {
    const { community, weekly, draft, editor } = await setup();

    await run(sendDigests({ force: true }));
    await expect(mails(weekly.email, "follower_digest")).resolves.toHaveLength(0);

    await db.insert(emailSuppressions).values({ email: weekly.email.toLowerCase(), scope: "followers" });
    const event = await draft("Meetup sin lectores", 4);
    await call(router.events.publish, { communityId: community.id, eventId: event.id }, by(editor));
    await run(sendDigests({ force: true }));
    await expect(mails(weekly.email, "follower_digest")).resolves.toHaveLength(0);
  });

  test("switching back to each event is one more follow; the caller's choice comes back with the count", async () => {
    const { community, weekly } = await setup();
    const input = { communityId: community.id };

    await expect(call(router.communities.followState, input, by(weekly))).resolves.toStrictEqual({
      followers: 2,
      following: true,
      digest: "weekly",
    });
    await expect(call(router.communities.follow, { ...input, digest: "each" }, by(weekly))).resolves.toMatchObject({
      digest: "each",
    });
    // Following again without saying how keeps the choice
    await expect(call(router.communities.follow, input, by(weekly))).resolves.toMatchObject({ digest: "each" });
  });
});
