import { call } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember } from "test/factories";

const hold = (communityId: string, actor: Parameters<typeof by>[0], extra: Record<string, unknown> = {}) =>
  call(
    router.events.hold,
    { communityId, day: "2029-09-04", startTime: "19:00", durationMin: 120, ...extra },
    by(actor)
  );

describe("the hold cap", () => {
  test("dating a draft without a date counts as a new hold; renewing a live one doesn't", async () => {
    const community = await makeCommunity({ name: "Comunidad con muchas reservas" });
    const editor = await makeMember(community.id, "editor");
    const held = [];
    for (let index = 0; index < 8; index++)
      held.push(await hold(community.id, editor, { day: `2029-09-${10 + index}` }));
    const undated = await makeEvent(community.id, { name: "Sin fecha", status: "draft" });

    await expect(hold(community.id, editor, { eventId: undated.id, day: "2029-09-24" })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "too_many_holds" },
    });
    // A lapsed hold is a draft without a date too
    const lapsed = await makeEvent(community.id, { status: "draft", heldUntil: new Date(Date.now() - 1000) });
    await expect(hold(community.id, editor, { eventId: lapsed.id, day: "2029-09-25" })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "too_many_holds" },
    });

    const renewed = await hold(community.id, editor, { eventId: held[0].id, day: "2029-09-26" });
    expect(renewed).toMatchObject({ id: held[0].id, status: "draft", dateChosen: true });
  });

  test("a Saturday workshop from 10:00 for 6 hours is a date like any other", async () => {
    const community = await makeCommunity({ name: "Comunidad de talleres" });
    const editor = await makeMember(community.id, "editor");

    const workshop = await hold(community.id, editor, { day: "2029-09-15", startTime: "10:00", durationMin: 360 });

    expect(workshop).toMatchObject({ startDate: "2029-09-15T13:00:00.000Z", endDate: "2029-09-15T19:00:00.000Z" });
  });
});
