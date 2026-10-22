import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { communityMembers, emailDeliveries, events } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember } from "test/factories";

async function setup() {
  const [host, mine, other] = await Promise.all([
    makeCommunity({ name: "Comunidad anfitriona" }),
    makeCommunity({ name: "Comunidad hermana" }),
    makeCommunity({ name: "Comunidad invitada" }),
  ]);
  const editor = await makeMember(host.id, "editor");
  // The editor also organizes the sister community
  await db.insert(communityMembers).values({ communityId: mine.id, userId: editor.id, role: "editor" });
  const otherEditor = await makeMember(other.id, "editor");
  const event = await makeEvent(host.id, { name: "Meetup compartido", status: "published" });
  const ref = { communityId: host.id, eventId: event.id };
  const setCohosts = async (ids: string[]) => {
    const current = await call(router.events.get, ref, by(editor));
    return call(
      router.events.save,
      { ...ref, expectedUpdatedAt: current.updatedAt, patch: { cohosts: ids } },
      by(editor)
    );
  };

  return { host, mine, other, editor, otherEditor, event, setCohosts };
}

describe("co-hosts", () => {
  test("a community you also organize joins at once; another is invited, by email, and shows once it accepts", async () => {
    const { host, mine, other, otherEditor, event, setCohosts } = await setup();
    const publicEvent = () => call(router.events.public, { communitySlug: host.slug, eventSlug: event.slug }, by(null));

    await expect(setCohosts([mine.id, other.id])).resolves.toMatchObject({
      cohosts: [
        { id: mine.id, status: "accepted" },
        { id: other.id, status: "invited" },
      ],
    });
    await expect(publicEvent()).resolves.toMatchObject({ cohosts: [{ slug: mine.slug }] });
    await expect(
      db
        .select()
        .from(emailDeliveries)
        .where(and(eq(emailDeliveries.to, otherEditor.email), eq(emailDeliveries.kind, "cohost_invite")))
    ).resolves.toHaveLength(1);

    await call(
      router.events.answerCohost,
      { communityId: other.id, hostedEventId: event.id, accept: true },
      by(otherEditor)
    );
    await expect(publicEvent()).resolves.toMatchObject({ cohosts: [{ slug: mine.slug }, { slug: other.slug }] });
  });

  test("only the invited community answers; at most three; removing one takes it off", async () => {
    const { mine, other, editor, otherEditor, event, setCohosts } = await setup();
    await setCohosts([other.id]);

    await expect(
      call(router.events.answerCohost, { communityId: mine.id, hostedEventId: event.id, accept: true }, by(editor))
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      call(router.events.cohostInvitations, { communityId: other.id }, by(otherEditor))
    ).resolves.toMatchObject([{ eventId: event.id, host: "Comunidad anfitriona" }]);
    const extra = await Promise.all([makeCommunity(), makeCommunity(), makeCommunity()]);
    await expect(setCohosts([other.id, ...extra.map((row) => row.id)])).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(setCohosts([])).resolves.toMatchObject({ cohosts: [] });
  });

  test("a draft's invitations wait for publishing; a no stays a no", async () => {
    const { other, otherEditor, event, setCohosts } = await setup();
    await db
      .update(events)
      .set({ status: "draft", heldUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(events.id, event.id));
    const invites = () =>
      db
        .select()
        .from(emailDeliveries)
        .where(and(eq(emailDeliveries.to, otherEditor.email), eq(emailDeliveries.kind, "cohost_invite")));

    await setCohosts([other.id]);
    await expect(invites()).resolves.toHaveLength(0);
    await db.update(events).set({ status: "published" }).where(eq(events.id, event.id));
    await call(
      router.events.answerCohost,
      { communityId: other.id, hostedEventId: event.id, accept: false },
      by(otherEditor)
    );

    await expect(setCohosts([other.id])).resolves.toMatchObject({ cohosts: [{ id: other.id, status: "declined" }] });
    await expect(
      call(router.events.cohostInvitations, { communityId: other.id }, by(otherEditor))
    ).resolves.toHaveLength(0);
  });
});
