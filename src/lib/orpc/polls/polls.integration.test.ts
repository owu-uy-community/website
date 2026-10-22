import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, events } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeMember } from "test/factories";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const [asker, python, data, outsider] = await Promise.all([
    makeCommunity({ name: "Comunidad que pregunta" }),
    makeCommunity({ name: "Python invitada" }),
    makeCommunity({ name: "Datos invitada" }),
    makeCommunity({ name: "No invitada" }),
  ]);
  const [askerEditor, pythonEditor, dataEditor, outsiderEditor] = await Promise.all([
    makeMember(asker.id, "editor"),
    makeMember(python.id, "editor"),
    makeMember(data.id, "editor"),
    makeMember(outsider.id, "editor"),
  ]);
  const days = [inDays(20), inDays(21), inDays(27)];
  const poll = await call(
    router.polls.create,
    { communityId: asker.id, title: "Meetup conjunto", days, invited: [python.id, data.id] },
    by(askerEditor)
  );

  return { asker, python, data, outsider, askerEditor, pythonEditor, dataEditor, outsiderEditor, days, poll };
}

describe("date polls", () => {
  test("invited communities get an email and answer per day; everyone sees the answers", async () => {
    const { asker, python, data, pythonEditor, dataEditor, days, poll } = await setup();

    await call(
      router.polls.vote,
      {
        communityId: python.id,
        pollId: poll.id,
        votes: [
          { day: days[0], answer: "yes" },
          { day: days[1], answer: "no" },
        ],
      },
      by(pythonEditor)
    );
    await call(
      router.polls.vote,
      { communityId: data.id, pollId: poll.id, votes: [{ day: days[0], answer: "maybe" }] },
      by(dataEditor)
    );

    await expect(
      db
        .select()
        .from(emailDeliveries)
        .where(and(eq(emailDeliveries.to, pythonEditor.email), eq(emailDeliveries.kind, "date_poll")))
    ).resolves.toHaveLength(1);
    await expect(call(router.polls.list, { communityId: asker.id }, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const [seen] = await call(router.polls.list, { communityId: data.id }, by(dataEditor));
    expect(seen.communities.map((row) => [row.name, row.answers])).toStrictEqual([
      ["Comunidad que pregunta", {}],
      ["Python invitada", { [days[0]]: "yes", [days[1]]: "no" }],
      ["Datos invitada", { [days[0]]: "maybe" }],
    ]);
  });

  test("a community that wasn't asked can't see or answer; only the asker picks", async () => {
    const { outsider, python, outsiderEditor, pythonEditor, days, poll } = await setup();

    await expect(call(router.polls.list, { communityId: outsider.id }, by(outsiderEditor))).resolves.toStrictEqual([]);
    await expect(
      call(
        router.polls.vote,
        { communityId: outsider.id, pollId: poll.id, votes: [{ day: days[0], answer: "yes" }] },
        by(outsiderEditor)
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(router.polls.choose, { communityId: python.id, pollId: poll.id, day: days[0] }, by(pythonEditor))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("picking a day reserves it and invites the communities that said yes as co-hosts; then it's closed", async () => {
    const { asker, python, askerEditor, pythonEditor, days, poll } = await setup();
    await call(
      router.polls.vote,
      { communityId: python.id, pollId: poll.id, votes: [{ day: days[2], answer: "yes" }] },
      by(pythonEditor)
    );

    const { eventId } = await call(
      router.polls.choose,
      { communityId: asker.id, pollId: poll.id, day: days[2] },
      by(askerEditor)
    );

    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    expect(event).toMatchObject({ status: "draft", name: "Meetup conjunto", communityId: asker.id });
    await expect(call(router.events.get, { communityId: asker.id, eventId }, by(askerEditor))).resolves.toMatchObject({
      cohosts: [{ id: python.id, status: "invited" }],
    });
    await expect(
      call(
        router.polls.vote,
        { communityId: python.id, pollId: poll.id, votes: [{ day: days[0], answer: "yes" }] },
        by(pythonEditor)
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
