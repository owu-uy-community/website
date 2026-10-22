import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, emailSuppressions } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeUser } from "test/factories";

const sent = (to: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, "follower_new_event")));

describe("following a community", () => {
  test("follow and unfollow, counted; anyone sees the count", async () => {
    const community = await makeCommunity();
    const [ana, beto] = await Promise.all([makeUser(), makeUser()]);
    const input = { communityId: community.id };

    await call(router.communities.follow, input, by(ana));
    await call(router.communities.follow, input, by(ana));
    await expect(call(router.communities.follow, input, by(beto))).resolves.toStrictEqual({
      followers: 2,
      following: true,
    });
    await expect(call(router.communities.unfollow, input, by(beto))).resolves.toStrictEqual({
      followers: 1,
      following: false,
    });
    await expect(call(router.communities.followState, input, by(null))).resolves.toStrictEqual({
      followers: 1,
      following: false,
    });
  });

  test("publishing emails each follower once, with one-click unsubscribe; turning these off stops only them", async () => {
    const community = await makeCommunity({ name: "Comunidad seguida" });
    const editor = await makeMember(community.id, "editor");
    const [ana, quiet] = await Promise.all([makeUser(), makeUser()]);
    for (const follower of [ana, quiet]) {
      await call(router.communities.follow, { communityId: community.id }, by(follower));
    }
    // Turned off follower mail; reminders being off (ana) doesn't touch it
    await db.insert(emailSuppressions).values([
      { email: quiet.email.toLowerCase(), scope: "followers" },
      { email: ana.email.toLowerCase(), scope: "reminders" },
    ]);
    const start = new Date(Date.now() + 20 * 86_400_000);
    const event = await makeEvent(community.id, {
      name: "Charlas de noviembre",
      summary: "Dos charlas y pizza",
      status: "draft",
      heldUntil: new Date(Date.now() + 7 * 86_400_000),
      registration: "none",
      startDate: start,
      endDate: new Date(start.getTime() + 2 * 3_600_000),
    });

    await call(router.events.publish, { communityId: community.id, eventId: event.id }, by(editor));

    await expect(sent(ana.email)).resolves.toMatchObject([
      {
        subject: "Comunidad seguida publicó: Charlas de noviembre",
        headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      },
    ]);
    await expect(sent(quiet.email)).resolves.toHaveLength(0);
  });
});
