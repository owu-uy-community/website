import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by, type RouterInputs } from "test/context";
import { makeBoard, makeSiteAdmin, makeUser } from "test/factories";

async function setup() {
  const { event } = await makeBoard();
  const staff = await makeSiteAdmin();
  const act = (input: Omit<RouterInputs["countdown"]["updateState"], "eventId">) =>
    call(router.countdown.updateState, { eventId: event.id, ...input }, by(staff));

  return { eventId: event.id, staff, act };
}

describe("countdown", () => {
  test("an event without a countdown reads as stopped at zero", async () => {
    const { eventId } = await setup();

    await expect(call(router.countdown.getState, { eventId }, by(null))).resolves.toMatchObject({
      isRunning: false,
      remainingSeconds: 0,
      totalSeconds: 0,
      soundEnabled: false,
    });
    await expect(call(router.countdown.getEndtime, { eventId }, by(null))).resolves.toStrictEqual({
      targetTime: null,
    });
  });

  test("set, start, pause and reset drive the stored state and the displays", async () => {
    const { eventId, act } = await setup();
    const publish = vi.spyOn(hub, "publish");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));

    await act({ action: "setDuration", durationSeconds: 300 });
    const started = await act({ action: "start" });
    vi.setSystemTime(new Date("2026-11-07T18:01:00.000Z"));
    const paused = await act({ action: "pause" });
    const reset = await act({ action: "reset" });

    expect(started).toMatchObject({ isRunning: true, targetTime: "2026-11-07T18:05:00.000Z", totalSeconds: 300 });
    expect(paused).toMatchObject({ isRunning: false, remainingSeconds: 240, targetTime: undefined });
    expect(reset).toMatchObject({ isRunning: false, remainingSeconds: 0, totalSeconds: 300 });
    expect(publish).toHaveBeenCalledWith(
      `event:${eventId}:countdown`,
      "countdown_state_change",
      expect.objectContaining({ isRunning: true, targetTime: "2026-11-07T18:05:00.000Z" })
    );
  });

  test("a running countdown is derived from its target time on read", async () => {
    const { eventId, act } = await setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T18:00:00.000Z"));
    await act({ action: "setTargetTime", targetTime: "2026-11-07T18:10:00.000Z" });
    await act({ action: "start", targetTime: "2026-11-07T18:10:00.000Z" });

    vi.setSystemTime(new Date("2026-11-07T18:04:00.000Z"));

    await expect(call(router.countdown.getState, { eventId }, by(null))).resolves.toMatchObject({
      isRunning: true,
      remainingSeconds: 360,
    });
    await expect(call(router.countdown.getEndtime, { eventId }, by(null))).resolves.toStrictEqual({
      targetTime: "2026-11-07T18:10:00.000Z",
    });
  });

  test("toggleSound flips the sound flag", async () => {
    const { act } = await setup();

    expect((await act({ action: "toggleSound" })).soundEnabled).toBe(true);
    expect((await act({ action: "toggleSound" })).soundEnabled).toBe(false);
  });

  test("only site staff drive the countdown", async () => {
    const { eventId } = await setup();
    const user = await makeUser();

    await expect(call(router.countdown.updateState, { eventId, action: "reset" }, by(user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test.fails("#12 a duration that isn't positive and a target time that isn't a date are BAD_REQUESTs", async () => {
    const { act } = await setup();

    await expect(act({ action: "setDuration", durationSeconds: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(act({ action: "setTargetTime", targetTime: "mañana" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test.fails("#13 the countdown of an unknown event is NOT_FOUND", async () => {
    const staff = await makeSiteAdmin();

    await expect(
      call(router.countdown.updateState, { eventId: "no-existe", action: "toggleSound" }, by(staff))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
