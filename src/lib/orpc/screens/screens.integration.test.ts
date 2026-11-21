import { call } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { screens } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by } from "test/context";
import { makeBoard, makeMember, makeSiteAdmin } from "test/factories";

/** An event, its site staff, and a display of its own (a random id, like the one in localStorage). */
async function setup() {
  const board = await makeBoard();
  const staff = await makeSiteAdmin();
  const id = `scr-${createId()}`;
  const kiosk = `/comunidad/${board.community.slug}/events/${board.event.slug}/kiosk`;
  const beat = (overrides: Record<string, unknown> = {}) =>
    call(
      router.screens.beat,
      { id, path: kiosk, eventId: board.event.id, userAgent: "Chrome", ...overrides },
      by(null)
    );
  const list = () => call(router.screens.list, { eventId: board.event.id }, by(staff));

  return { ...board, staff, id, kiosk, beat, list };
}

describe("the heartbeat", () => {
  test("a display that beats is listed under its event, online, saying what it shows", async () => {
    const { id, beat, list } = await setup();

    await expect(beat()).resolves.toStrictEqual({ ok: true });

    await expect(list()).resolves.toStrictEqual([
      expect.objectContaining({ id, name: "", label: "Kiosco · grilla", userAgent: "Chrome", online: true }),
    ]);
  });

  test("a beat never renames: the name the admin gave survives the display's next beat", async () => {
    const { id, staff, beat, list, community, event } = await setup();
    await beat();
    await call(router.screens.rename, { id, name: "Kiosco · Lobby" }, by(staff));

    await beat({ path: `/comunidad/${community.slug}/events/${event.slug}/countdown` });

    await expect(list()).resolves.toStrictEqual([
      expect.objectContaining({ id, name: "Kiosco · Lobby", label: "Pantalla · cuenta regresiva" }),
    ]);
  });

  test("a beat without an event keeps the stored one; a screen not seen for a minute is offline", async () => {
    const { id, beat, list } = await setup();
    await beat();

    await beat({ eventId: undefined });
    await db
      .update(screens)
      .set({ lastSeenAt: new Date(Date.now() - 61_000) })
      .where(eq(screens.id, id));

    await expect(list()).resolves.toStrictEqual([expect.objectContaining({ id, online: false })]);
  });

  test("only display routes beat, and only for events that exist", async () => {
    const { beat } = await setup();

    await expect(beat({ path: "/admin/owu" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(beat({ eventId: "no-such-event" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("a display that beats in a loop is throttled; the others still get through", async () => {
    const { beat } = await setup();

    const results = await Promise.allSettled(Array.from({ length: 12 }, () => beat()));
    const other = await beat({ id: `scr-${createId()}` });

    expect(
      results.filter((r) => r.status === "rejected" && (r.reason as { code: string }).code === "TOO_MANY_REQUESTS")
    ).toHaveLength(2);
    expect(other).toStrictEqual({ ok: true });
  });
});

describe("managing screens", () => {
  test("renaming and forgetting a screen log it and tell the event's admin pages", async () => {
    const { id, staff, beat, list, event } = await setup();
    await beat();
    const publish = vi.spyOn(hub, "publish");
    const pings = () =>
      publish.mock.calls.filter(([channel, name]) => channel === `event:${event.id}:ops` && name === "screens").length;

    const renamed = await call(router.screens.rename, { id, name: "  Video wall  " }, by(staff));
    expect(renamed).toMatchObject({ id, name: "Video wall" });
    expect(pings()).toBe(1);
    await call(router.screens.forget, { id }, by(staff));
    expect(pings()).toBe(2);

    await expect(list()).resolves.toStrictEqual([]);
    const log = await call(router.activity.list, { eventId: event.id, entityId: id }, by(staff));
    expect(log.map((line) => [line.verb, line.summary])).toStrictEqual([
      ["screen.forgotten", "olvidó la pantalla «Video wall»"],
      ["screen.renamed", "nombró la pantalla «Video wall»"],
    ]);
  });

  test("identify and reload reach that screen on the screens channel", async () => {
    const { id, staff, beat } = await setup();
    await beat();
    await call(router.screens.rename, { id, name: "TV Cueva" }, by(staff));
    const publish = vi.spyOn(hub, "publish");

    await call(router.screens.identify, { id }, by(staff));
    await call(router.screens.reload, { id }, by(staff));

    expect(publish).toHaveBeenCalledWith("screens", "identify", { id, name: "TV Cueva", label: "Kiosco · grilla" });
    expect(publish).toHaveBeenCalledWith("screens", "reload", { id });
  });

  test("a screen that was forgotten can't be signalled", async () => {
    const { staff } = await setup();

    await expect(call(router.screens.identify, { id: "scr-gone-for-good" }, by(staff))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("only site staff see and manage screens; even the event's own team can't", async () => {
    const { id, beat, community, event } = await setup();
    await beat();
    const owner = await makeMember(community.id, "owner");

    await expect(call(router.screens.list, { eventId: event.id }, by(owner))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.screens.rename, { id, name: "Mío" }, by(owner))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.screens.reload, { id }, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
