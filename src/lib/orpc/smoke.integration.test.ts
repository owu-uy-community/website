import { call } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeSiteAdmin } from "test/factories";

describe("integration harness", () => {
  test("harness smoke: a site admin creates a track on a free slot", async () => {
    const { event, rooms, slots } = await makeBoard();
    const admin = await makeSiteAdmin();

    const note = await call(
      router.tracks.create,
      {
        title: "Effect en producción",
        openSpaceId: event.id,
        scheduleId: slots.early.id,
        roomId: rooms.plain.id,
        needsTV: false,
        needsWhiteboard: false,
        skipResourceValidation: false,
      },
      by(admin)
    );

    expect(note).toMatchObject({ title: "Effect en producción", roomId: rooms.plain.id, scheduleId: slots.early.id });
  });
});
