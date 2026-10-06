import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by } from "test/context";
import { makeBoard, makeSiteAdmin, makeTrack, makeUser } from "test/factories";

async function setup() {
  const board = await makeBoard();
  const staff = await makeSiteAdmin();
  const talk = await makeTrack(
    { eventId: board.event.id, scheduleId: board.slots.early.id, roomId: board.rooms.tv.id },
    { title: "En pantalla" }
  );

  return { ...board, eventId: board.event.id, staff, talk };
}

describe("cast", () => {
  test("staff casts a talk to the screens and can clear it", async () => {
    const { eventId, staff, talk } = await setup();
    const publish = vi.spyOn(hub, "publish");

    await call(router.cast.setHighlightedNote, { eventId, trackId: talk.id }, by(staff));
    const cast = await call(router.cast.getState, { eventId }, by(null));
    await call(router.cast.setHighlightedNote, { eventId, trackId: null }, by(staff));
    const cleared = await call(router.cast.getState, { eventId }, by(null));

    expect(cast).toMatchObject({ trackId: talk.id, note: { title: "En pantalla", timeSlot: "15:00 - 15:45" } });
    expect(cleared).toStrictEqual({ trackId: null, note: null });
    expect(publish).toHaveBeenCalledWith(
      `event:${eventId}:cast`,
      "note_highlighted",
      expect.objectContaining({ note: expect.objectContaining({ id: talk.id }) })
    );
  });

  test("deleting the cast talk clears the screen", async () => {
    const { eventId, staff, talk } = await setup();
    await call(router.cast.setHighlightedNote, { eventId, trackId: talk.id }, by(staff));

    await call(router.tracks.delete, { id: talk.id }, by(staff));

    await expect(call(router.cast.getState, { eventId }, by(null))).resolves.toStrictEqual({
      trackId: null,
      note: null,
    });
  });

  test("only site staff cast", async () => {
    const { eventId, talk } = await setup();
    const user = await makeUser();

    await expect(call(router.cast.setHighlightedNote, { eventId, trackId: talk.id }, by(user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test.fails("#12 casting a talk from another event is NOT_FOUND", async () => {
    const { staff, talk } = await setup();
    const elsewhere = await makeBoard();

    await expect(
      call(router.cast.setHighlightedNote, { eventId: elsewhere.event.id, trackId: talk.id }, by(staff))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
