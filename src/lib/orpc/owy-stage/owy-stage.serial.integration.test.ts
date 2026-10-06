import { call } from "@orpc/server";
import { sql } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";

import { EXTERNAL_SERVICES } from "app/lib/constants";
import { db } from "lib/db";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by, type RouterInputs } from "test/context";
import { makeBoard, makeRoom, makeSiteAdmin, makeTrack, makeUser } from "test/factories";
import { server } from "test/msw/server";

/** The wall is one global row, so every test starts with nothing on air. */
async function setup() {
  await db.execute(sql`TRUNCATE owy_stage_state, owy_stage_inputs CASCADE`);
  const staff = await makeSiteAdmin();
  const putOnAir = (input: RouterInputs["owyStage"]["setScene"]) => call(router.owyStage.setScene, input, by(staff));

  return { staff, putOnAir };
}

describe("the wall", () => {
  test("nothing on air reads as the black scene with no round", async () => {
    await setup();

    await expect(call(router.owyStage.getState, undefined, by(null))).resolves.toMatchObject({
      scene: "black",
      round: "",
    });
  });

  test("taking a scene persists it, mints a round and tells every stage", async () => {
    const { putOnAir } = await setup();
    const publish = vi.spyOn(hub, "publish");

    const state = await putOnAir({ scene: "now-playing", params: { song: "Ella", artist: "Bebe" } });
    const read = await call(router.owyStage.getState, undefined, by(null));

    expect(state.round).not.toBe("");
    expect(read).toMatchObject({ scene: "now-playing", round: state.round, params: { song: "Ella", artist: "Bebe" } });
    expect(publish).toHaveBeenCalledWith("owy-stage", "scene", expect.objectContaining({ round: state.round }));
  });

  test("editing what is on air keeps the round; a restart starts a new one", async () => {
    const { putOnAir } = await setup();
    const first = await putOnAir({ scene: "now-playing" });

    const edited = await putOnAir({ scene: "now-playing", params: { song: "Otra" } });
    const restarted = await putOnAir({ scene: "now-playing", restart: true });

    expect(edited.round).toBe(first.round);
    expect(restarted.round).not.toBe(first.round);
  });

  test("only site staff take scenes", async () => {
    await setup();
    const user = await makeUser();

    await expect(call(router.owyStage.setScene, { scene: "black" }, by(user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call(router.owyStage.fireEffect, { effect: "confetti" }, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test.fails("#14 scene params that don't fit the scene are a BAD_REQUEST", async () => {
    const { putOnAir } = await setup();

    await expect(putOnAir({ scene: "now-playing", params: { song: "x".repeat(200) } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test.fails("#13 pointing the wall at an unknown event is NOT_FOUND", async () => {
    const { putOnAir } = await setup();

    await expect(putOnAir({ scene: "black", eventId: "no-existe" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("the rundown round-trips", async () => {
    const { staff } = await setup();
    const steps = [
      { id: "s1", scene: "logo" as const, params: {}, sec: 10 },
      { id: "s2", scene: "now-playing" as const, params: { song: "Tema" }, sec: 0 },
    ];

    await call(router.owyStage.saveRundown, { steps }, by(staff));

    await expect(call(router.owyStage.getRundown, undefined, by(staff))).resolves.toMatchObject(steps);
  });

  test("effects and Owy's face are broadcast as they are", async () => {
    const { staff } = await setup();
    const publish = vi.spyOn(hub, "publish");

    await call(router.owyStage.fireEffect, { effect: "caption", payload: { text: "¡Hola!" } }, by(staff));
    await call(router.owyStage.setFace, { state: "speaking", transcript: { who: "output", text: "Hola" } }, by(staff));

    expect(publish).toHaveBeenCalledWith("owy-stage", "effect", { effect: "caption", payload: { text: "¡Hola!" } });
    expect(publish).toHaveBeenCalledWith("owy-stage", "face", {
      state: "speaking",
      transcript: { who: "output", text: "Hola" },
    });
  });

  test("now playing only touches the wall while the now-playing scene is up, and only on a new song", async () => {
    const { staff, putOnAir } = await setup();
    const report = (song: string) => call(router.owyStage.nowPlaying, { song, artist: "Drexler" }, by(staff));

    await expect(report("Movimiento")).resolves.toStrictEqual({ applied: false });
    await putOnAir({ scene: "now-playing" });

    expect([await report("Movimiento"), await report("Movimiento")]).toStrictEqual([
      { applied: true },
      { applied: false },
    ]);
  });
});

describe("phone inputs", () => {
  test("answers count only for the round on air; `once` keeps the first answer", async () => {
    const { putOnAir } = await setup();
    const { round } = await putOnAir({ scene: "now-playing" });
    const send = (value: string, overrides: Record<string, string> = {}) =>
      call(router.owyStage.submit, { round, key: "voto", value, voter: "tel-1", mode: "once", ...overrides }, by(null));

    await send("primera");
    await send("segunda");
    const stale = await send("tarde", { round: "ronda-vieja" });
    const inputs = await call(router.owyStage.inputs, { round }, by(null));

    expect(stale).toStrictEqual({ ok: false });
    expect(inputs.map((input) => [input.voter, input.value])).toStrictEqual([["tel-1", "primera"]]);
  });

  test.fails("#15 one phone can't flood the wall", async () => {
    const { putOnAir } = await setup();
    const { round } = await putOnAir({ scene: "now-playing" });

    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        call(router.owyStage.submit, { round, key: "k", value: `v${i}`, voter: "spam", mode: "multi" }, by(null))
      )
    );

    expect(
      results.some(
        (result) => result.status === "rejected" && (result.reason as { code: string }).code === "TOO_MANY_REQUESTS"
      )
    ).toBe(true);
  });
});

describe("data-driven scenes", () => {
  test("the pulse counts an event's ideas and active rooms", async () => {
    await setup();
    const { event, rooms, slots } = await makeBoard();
    await makeRoom(event.id, { isActive: false });
    await makeTrack({ eventId: event.id, scheduleId: slots.early.id, roomId: rooms.plain.id });

    await expect(call(router.owyStage.getPulse, { eventId: event.id }, by(null))).resolves.toStrictEqual({
      tickets: null,
      board: { ideas: 1, rooms: 2 },
    });
  });

  test("meetups are the next eight, soonest first; a feed outage is an empty list", async () => {
    await setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
    const meetup = (day: number) => ({
      name: "OWU",
      title: `Meetup ${day}`,
      datetime: `2026-11-${String(day).padStart(2, "0")}T21:00:00.000Z`,
      venue: null,
      event_url: `https://meetup.com/${day}`,
    });
    server.use(
      http.get(EXTERNAL_SERVICES.meetupBot, () =>
        HttpResponse.json({ meetups: [meetup(20), meetup(2), ...[3, 4, 5, 6, 7, 8, 9, 10].map(meetup)] })
      )
    );

    const meetups = await call(router.owyStage.getMeetups, undefined, by(null));
    server.use(http.get(EXTERNAL_SERVICES.meetupBot, () => new HttpResponse(null, { status: 502 })));

    expect(meetups.map((m) => m.title)).toStrictEqual([2, 3, 4, 5, 6, 7, 8, 9].map((d) => `Meetup ${d}`));
    await expect(call(router.owyStage.getMeetups, undefined, by(null))).resolves.toStrictEqual([]);
  });

  test("the weather is the current reading plus the next six hours; an outage is null", async () => {
    await setup();
    const hours = Array.from({ length: 10 }, (_, i) => `2026-11-07T${String(10 + i).padStart(2, "0")}:00`);
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json({
          current: {
            time: "2026-11-07T11:30",
            temperature_2m: 22,
            apparent_temperature: 23,
            weather_code: 1,
            wind_speed_10m: 15,
          },
          hourly: {
            time: hours,
            temperature_2m: hours.map((_, i) => 20 + i),
            precipitation_probability: hours.map(() => 10),
            weather_code: hours.map(() => 2),
          },
        })
      )
    );

    const weather = await call(router.owyStage.getWeather, undefined, by(null));
    server.use(http.get("https://api.open-meteo.com/v1/forecast", () => new HttpResponse(null, { status: 500 })));

    expect(weather).toMatchObject({ temp: 22, feels: 23, wind: 15 });
    expect(weather?.hours.map((hour) => hour.time)).toStrictEqual([
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
    ]);
    await expect(call(router.owyStage.getWeather, undefined, by(null))).resolves.toBeNull();
  });

  test("past speakers come from the content folder, without the placeholder entries", async () => {
    await setup();

    const speakers = await call(router.owyStage.getSpeakers, undefined, by(null));

    expect(speakers.length).toBeGreaterThan(0);
    expect(speakers.map((speaker) => speaker.slug)).not.toContain("openspace");
  });

  test("without Spotify configured the wall shows no track and the status says so", async () => {
    const { staff } = await setup();

    await expect(call(router.owyStage.getSpotify, undefined, by(null))).resolves.toBeNull();
    await expect(call(router.owyStage.spotifyStatus, undefined, by(staff))).resolves.toStrictEqual({
      configured: false,
      account: null,
    });
  });
});
