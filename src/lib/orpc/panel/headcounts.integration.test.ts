import { call } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp } from "test/factories";

describe("panel.headcounts", () => {
  test("counts each published event's people by where they stand, never a draft's or another community's", async () => {
    const [ours, theirs] = await Promise.all([
      makeCommunity({ name: "Comunidad que cuenta" }),
      makeCommunity({ name: "Comunidad ajena" }),
    ]);
    const [editor, member, otherEditor] = await Promise.all([
      makeMember(ours.id, "editor"),
      makeMember(ours.id, "member"),
      makeMember(theirs.id, "editor"),
    ]);
    const [published, draft, foreign] = await Promise.all([
      makeEvent(ours.id, { status: "published" }),
      makeEvent(ours.id, { status: "draft" }),
      makeEvent(theirs.id, { status: "published" }),
      // Nobody signed up: left out of the answer
      makeEvent(ours.id, { status: "published" }),
    ]);
    for (const overrides of [
      { guests: 2 },
      {},
      { status: "offered" as const, guests: 1 },
      { status: "waitlisted" as const },
      { status: "pending" as const },
      { status: "cancelled" as const, guests: 4 },
    ]) {
      await makeRsvp(published.id, overrides);
    }
    await makeRsvp(draft.id);
    await makeRsvp(foreign.id);

    for (const outsider of [member, otherEditor]) {
      await expect(call(router.panel.headcounts, { communityId: ours.id }, by(outsider))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(call(router.panel.headcounts, { communityId: ours.id }, by(editor))).resolves.toStrictEqual({
      [published.id]: { attending: 2, guests: 3, offered: 1, waitlisted: 1, pending: 1 },
    });
  });
});
