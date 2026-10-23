import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { attendees } from "lib/db/schema";
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
});
