import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { attendees, emailDeliveries } from "lib/db/schema";
import { presetQuestion } from "lib/organizar/presets";
import { liveServices } from "lib/orpc/services";
import { makeCommunity, makeEvent, makeRsvp } from "test/factories";

import { retention } from "./retention";

const rowOf = async (id: string) => (await db.select().from(attendees).where(eq(attendees.id, id)))[0];

describe(retention, () => {
  test("a year after an event, OWU's own sign-ups keep their count and check-in but not who they were", async () => {
    const community = await makeCommunity();
    const [old, recent] = await Promise.all([
      makeEvent(community.id, {
        startDate: new Date("2024-03-01T22:00:00Z"),
        endDate: new Date("2024-03-02T01:00:00Z"),
      }),
      makeEvent(community.id, { endDate: new Date(Date.now() - 30 * 86_400_000) }),
    ]);
    const checkedInAt = new Date("2024-03-01T22:10:00Z");
    const [gone, kept] = await Promise.all([
      makeRsvp(old.id, { answers: { empresa: "Acme" }, checkedInAt }),
      makeRsvp(recent.id),
    ]);

    await Effect.runPromiseWith(liveServices)(retention());

    await expect(rowOf(gone.id)).resolves.toMatchObject({
      name: "Anónimo",
      email: "",
      userId: null,
      answers: {},
      status: "attending",
      checkedInAt,
    });
    await expect(rowOf(kept.id)).resolves.toMatchObject({ name: kept.name, email: kept.email });
  });

  test("a week after an event, the ID the building asked for is gone; the other answers stay", async () => {
    const community = await makeCommunity();
    const questions = [presetQuestion("dieta"), presetQuestion("ci")];
    const ended = (days: number) =>
      makeEvent(community.id, {
        questions,
        startDate: new Date(Date.now() - days * 86_400_000 - 7_200_000),
        endDate: new Date(Date.now() - days * 86_400_000),
      });
    const [old, recent] = await Promise.all([ended(8), ended(6)]);
    const answers = { dieta: "Vegana", ci: "1.234.567-8" };
    const [purged, kept] = await Promise.all([makeRsvp(old.id, { answers }), makeRsvp(recent.id, { answers })]);

    await Effect.runPromiseWith(liveServices)(retention());
    await Effect.runPromiseWith(liveServices)(retention());

    await expect(rowOf(purged.id)).resolves.toMatchObject({ answers: { dieta: "Vegana" }, name: purged.name });
    await expect(rowOf(kept.id)).resolves.toMatchObject({ answers });
  });

  test("the ID goes even after the question was removed, and so does the ID list mailed to the host", async () => {
    const community = await makeCommunity();
    const event = await makeEvent(community.id, {
      questions: [presetQuestion("dieta")],
      startDate: new Date(Date.now() - 9 * 86_400_000 - 7_200_000),
      endDate: new Date(Date.now() - 9 * 86_400_000),
    });
    const person = await makeRsvp(event.id, { answers: { dieta: "Vegana", ci: "1.234.567-8" } });
    const list = { kind: "venue_id_list", to: "seguridad@host.test.owu.uy", subject: "Lista", status: "sent" as const };
    const [old, fresh] = await db
      .insert(emailDeliveries)
      .values([
        {
          ...list,
          html: "<p>Ana 1.234.567-8</p>",
          text: "Ana\t1.234.567-8",
          dedupeKey: `test-old-${event.id}`,
          createdAt: new Date(Date.now() - 9 * 86_400_000),
        },
        { ...list, html: "<p>Beto 2.345.678-9</p>", text: "Beto\t2.345.678-9", dedupeKey: `test-new-${event.id}` },
      ])
      .returning({ id: emailDeliveries.id });

    await Effect.runPromiseWith(liveServices)(retention());

    await expect(rowOf(person.id)).resolves.toMatchObject({ answers: { dieta: "Vegana" } });
    const texts = await Promise.all(
      [old, fresh].map(
        async ({ id }) => (await db.select().from(emailDeliveries).where(eq(emailDeliveries.id, id)))[0].text
      )
    );
    expect(texts).toStrictEqual(["", "Beto\t2.345.678-9"]);
  });
});
