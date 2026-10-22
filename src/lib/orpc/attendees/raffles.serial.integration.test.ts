import { call } from "@orpc/server";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeAttendee, makeCommunity, makeEvent, makeSiteAdmin } from "test/factories";

describe("a raffle on the wall", () => {
  test("the stage's raffle scene spins through people in the hat and lands on the winner", async () => {
    // The wall is one global row.
    await db.execute(sql`TRUNCATE owy_stage_state, owy_stage_inputs CASCADE`);
    const staff = await makeSiteAdmin();
    const event = await makeEvent((await makeCommunity()).id);
    await makeAttendee(event.id, { name: "Valentina Núñez", checkedInAt: new Date() });
    await makeAttendee(event.id, { name: "Bruno Cabrera", checkedInAt: new Date() });
    const raffle = await call(router.attendees.raffles.create, { eventId: event.id, prize: "Remera OWU" }, by(staff));
    await call(router.attendees.raffles.draw, { raffleId: raffle.id }, by(staff));
    const [listed] = await call(router.attendees.raffles.list, { eventId: event.id }, by(staff));
    const winner = listed?.draws[0]?.name === "Bruno Cabrera" ? "Bruno C." : "Valentina N.";

    await call(router.attendees.raffles.show, { raffleId: raffle.id }, by(staff));

    const wall = await call(router.owyStage.getState, undefined, by(null));
    expect(wall).toMatchObject({ scene: "raffle", eventId: event.id, params: { title: "Remera OWU", winner } });
    expect(String(wall.params.names).split(", ").toSorted()).toStrictEqual(["Bruno C.", "Valentina N."]);
  });
});
