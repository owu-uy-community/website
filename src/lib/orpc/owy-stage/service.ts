import { createId } from "@paralleldrive/cuid2";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import * as z from "zod";

import { EXTERNAL_SERVICES } from "app/lib/constants";

import { owyStageInputs, owyStageState, rooms, tracks } from "../../db/schema";
import {
  DEFAULT_STAGE_STATE,
  OWY_STAGE_CHANNEL,
  RundownStepSchema,
  StoredFaceSchema,
  isSceneId,
  parseSceneParams,
  type FaceEvent,
  type InputEvent,
  type RundownStep,
  type SceneId,
  type StageInput,
  type StageState,
  type StoredFace,
  type SubmitInput,
} from "../../owy-stage/scenes";
import { query, transaction } from "../db";
import { Invalid, NotFound } from "../errors";
import * as Eventbrite from "../eventbrite/service";
import { fetchJson } from "../http";
import { Realtime } from "../services";
import type { SetNowPlayingInput, SetSceneInput, StageMeetup, StagePulse, StageSpeaker, StageWeather } from "./schemas";

const ROW_ID = "global";

/** What the wall shows. Never the Spotify link: that row column holds a refresh token. */
const onAir = {
  scene: owyStageState.scene,
  params: owyStageState.params,
  eventId: owyStageState.eventId,
  round: owyStageState.round,
  updatedAt: owyStageState.updatedAt,
  face: owyStageState.face,
};

const toStageState = (
  row:
    | {
        scene: string;
        params: Record<string, unknown>;
        eventId: string | null;
        round: string;
        updatedAt: Date;
        face: unknown;
      }
    | undefined
): StageState =>
  row && isSceneId(row.scene)
    ? {
        scene: row.scene,
        params: row.params,
        eventId: row.eventId,
        round: row.round,
        takenAt: row.updatedAt.toISOString(),
        face: StoredFaceSchema.safeParse(row.face).data ?? null,
      }
    : DEFAULT_STAGE_STATE;

const broadcast = (event: string, payload: unknown) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(OWY_STAGE_CHANNEL, event, payload);
  });

/**
 * What the wall is showing right now (persisted, so a freshly opened OBS
 * browser source starts on the right scene before any broadcast arrives).
 */
export const getStage = () =>
  query((db) => db.select(onAir).from(owyStageState).where(eq(owyStageState.id, ROW_ID))).pipe(
    Effect.map(([row]) => toStageState(row))
  );

const sceneParams = (scene: SceneId, params: unknown) =>
  Effect.try({
    try: () => parseSceneParams(scene, params) as Record<string, unknown>,
    catch: (error) =>
      new Invalid({
        message: "Esos datos no van con la escena",
        ...(error instanceof z.ZodError ? { issues: error.issues } : {}),
      }),
  });

/**
 * Persist the active scene (params validated against the scene's schema) and
 * tell every stage. The `round` marks a scene *going on air*: editing the
 * params of what is already up keeps it, so phone answers and running timers
 * survive a live edit; `restart` (what the library's take sends) mints a new
 * one. The row is locked meanwhile, so a take and an edit at once can't
 * interleave.
 */
export const setScene = (input: SetSceneInput) =>
  Effect.gen(function* () {
    const params = yield* sceneParams(input.scene, input.params);
    const state = yield* transaction(
      Effect.gen(function* () {
        yield* query((db) => db.insert(owyStageState).values({ id: ROW_ID }).onConflictDoNothing());
        const [row] = yield* query((db) =>
          db.select(onAir).from(owyStageState).where(eq(owyStageState.id, ROW_ID)).for("update")
        );
        const current = toStageState(row);
        const eventId = input.eventId === undefined ? current.eventId : input.eventId;
        const keep = !input.restart && input.scene === current.scene && Boolean(current.round);
        const round = keep ? current.round : createId();
        const takenAt = keep && current.takenAt ? new Date(current.takenAt) : new Date();
        yield* query((db) =>
          db
            .update(owyStageState)
            .set({ scene: input.scene, params, eventId, round, updatedAt: takenAt })
            .where(eq(owyStageState.id, ROW_ID))
        ).pipe(
          Effect.catchTag("ForeignKeyViolation", () =>
            Effect.fail(new NotFound({ entity: "event", message: "Ese evento no existe" }))
          )
        );

        return {
          scene: input.scene,
          params,
          eventId,
          round,
          takenAt: takenAt.toISOString(),
          face: current.face,
        } satisfies StageState;
      })
    );
    yield* broadcast("scene", state);

    return state;
  });

/** The operator's rundown, dropping any step whose scene no longer exists. */
export const getRundown = () =>
  query((db) =>
    db.select({ rundown: owyStageState.rundown }).from(owyStageState).where(eq(owyStageState.id, ROW_ID))
  ).pipe(
    Effect.map(([row]): RundownStep[] =>
      (row?.rundown ?? []).flatMap((step) => {
        const parsed = RundownStepSchema.safeParse(step);

        return parsed.success ? [parsed.data] : [];
      })
    )
  );

/**
 * Replace the rundown and tell the other admin devices (the wall ignores it).
 * Step params are stored as captured — empty means "whatever the scene
 * defaults to when it goes on air", so editing a default still shows through.
 */
export const saveRundown = (steps: RundownStep[]) =>
  Effect.gen(function* () {
    yield* query((db) =>
      db
        .insert(owyStageState)
        .values({ id: ROW_ID, rundown: steps })
        // Editing the rundown is not a take: keep `updatedAt` (phones time their rounds off it).
        .onConflictDoUpdate({
          target: owyStageState.id,
          set: { rundown: steps, updatedAt: sql`${owyStageState.updatedAt}` },
        })
    );
    yield* broadcast("rundown", { steps });

    return steps;
  });

/**
 * A recogniser heard a song. Only touches the wall while `now-playing` is on
 * air (so a listener can run all day without hijacking other scenes) and only
 * when the song actually changed.
 */
export const setNowPlaying = (input: SetNowPlayingInput) =>
  Effect.gen(function* () {
    const state = yield* getStage();
    if (state.scene !== "now-playing") return { applied: false };
    const params = parseSceneParams("now-playing", state.params);
    if (params.song === input.song && params.artist === input.artist) return { applied: false };
    yield* setScene({
      scene: "now-playing",
      params: {
        ...params,
        song: input.song,
        artist: input.artist,
        ...(input.playlist ? { playlist: input.playlist } : {}),
      },
      eventId: state.eventId,
    });

    return { applied: true };
  });

/** One-shot overlays (confetti, flash, caption…): broadcast as they are, nothing to persist. */
export const echo = <T>(event: "effect", payload: T) => broadcast(event, payload).pipe(Effect.as(payload));

/**
 * Owy's face, mirrored from a companion: broadcast as it is. The state, the
 * feeling and the card it announced are kept on the row — never the
 * transcript, a running total posted several times a second — so a wall that
 * connects mid-pitch catches up through getState.
 */
export const setFace = (face: FaceEvent) =>
  Effect.gen(function* () {
    if (!face.transcript || face.card || face.expression) {
      const { transcript: _transcript, ...kept } = face;
      const stored: StoredFace = { ...kept, at: new Date().toISOString() };
      yield* query((db) =>
        db
          .insert(owyStageState)
          .values({ id: ROW_ID, face: stored })
          // Not a take: keep `updatedAt` (phones time their rounds off it), like the rundown.
          .onConflictDoUpdate({
            target: owyStageState.id,
            set: { face: stored, updatedAt: sql`${owyStageState.updatedAt}` },
          })
      );
    }
    yield* broadcast("face", face);

    return face;
  });

// ---------------------------------------------------------------------------
// Phone inputs (/owy/play)
// ---------------------------------------------------------------------------

/**
 * Store one answer and tell the wall. `single` keeps the person's latest
 * value, `once` keeps their first, `multi` keeps every one. Rejected when the
 * wall has moved on to another round.
 */
export const submitInput = (input: SubmitInput) =>
  Effect.gen(function* () {
    const state = yield* getStage();
    if (!state.round || state.round !== input.round) return { ok: false };
    const row = {
      round: input.round,
      key: input.key,
      value: input.value,
      voter: input.voter,
      slot: input.mode === "multi" ? createId() : "",
    };
    const target = [owyStageInputs.round, owyStageInputs.key, owyStageInputs.voter, owyStageInputs.slot];
    const [saved] = yield* query((db) =>
      input.mode === "once"
        ? db.insert(owyStageInputs).values(row).onConflictDoNothing({ target }).returning()
        : db
            .insert(owyStageInputs)
            .values(row)
            .onConflictDoUpdate({ target, set: { value: input.value, createdAt: new Date() } })
            .returning()
    );
    if (!saved) return { ok: true };

    const event: InputEvent = {
      id: saved.id,
      key: saved.key,
      value: saved.value,
      voter: saved.voter,
      createdAt: saved.createdAt.toISOString(),
      round: saved.round,
      mode: input.mode,
    };
    yield* broadcast("input", event);

    return { ok: true, id: saved.id };
  });

/** Everything sent during a round, oldest first (capped; the wall aggregates). */
export const getInputs = (round: string) =>
  round
    ? query((db) =>
        db
          .select()
          .from(owyStageInputs)
          .where(eq(owyStageInputs.round, round))
          .orderBy(asc(owyStageInputs.createdAt))
          .limit(3000)
      ).pipe(
        Effect.map((rows) =>
          rows.map((row): StageInput => ({
            id: row.id,
            key: row.key,
            value: row.value,
            voter: row.voter,
            createdAt: row.createdAt.toISOString(),
          }))
        )
      )
    : Effect.succeed([]);

// ---------------------------------------------------------------------------
// Public reads for the data-driven scenes. External feeds degrade to empty.
// ---------------------------------------------------------------------------

/** Ticket counts over every attendee page. */
const tickets = () =>
  Effect.all([Eventbrite.getEvent(), Eventbrite.everyAttendee], { concurrency: "unbounded" }).pipe(
    Effect.map(([event, attendees]) => {
      const active = attendees.filter((attendee) => !attendee.cancelled && !attendee.refunded);

      return {
        checkedIn: active.filter((attendee) => attendee.checked_in).length,
        active: active.length,
        capacity: event.capacity ?? null,
      };
    }),
    Effect.orElseSucceed(() => null)
  );

export const getPulse = (eventId: string | null | undefined) =>
  Effect.gen(function* () {
    const [ticketCounts, board] = yield* Effect.all(
      [
        Eventbrite.isConfigured() ? tickets() : Effect.succeed(null),
        eventId
          ? Effect.all([
              query((db) => db.select({ count: count() }).from(tracks).where(eq(tracks.openSpaceId, eventId))),
              query((db) =>
                db
                  .select({ count: count() })
                  .from(rooms)
                  .where(and(eq(rooms.openSpaceId, eventId), eq(rooms.isActive, true)))
              ),
            ]).pipe(Effect.map(([[ideas], [activeRooms]]) => ({ ideas: ideas.count, rooms: activeRooms.count })))
          : Effect.succeed(null),
      ],
      { concurrency: "unbounded" }
    );

    return { tickets: ticketCounts, board } satisfies StagePulse;
  });

const MeetupFeedSchema = z.object({
  meetups: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      datetime: z.string(),
      venue: z.string().nullish(),
      event_url: z.string(),
    })
  ),
});

/** The community calendar (meetup-bot feed); the browser can't read it directly (no CORS). */
export const getMeetups = () =>
  fetchJson("meetup-bot", EXTERNAL_SERVICES.meetupBot, MeetupFeedSchema, { next: { revalidate: 1800 } }).pipe(
    Effect.map(({ meetups }): StageMeetup[] => {
      const recent = Date.now() - 3_600_000;

      return meetups
        .filter((meetup) => new Date(meetup.datetime).getTime() > recent)
        .toSorted((a, b) => a.datetime.localeCompare(b.datetime))
        .slice(0, 8)
        .map((meetup) => ({
          name: meetup.name,
          title: meetup.title,
          datetime: meetup.datetime,
          venue: meetup.venue ?? null,
          url: meetup.event_url,
        }));
    }),
    Effect.orElseSucceed((): StageMeetup[] => [])
  );

const ForecastSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    precipitation_probability: z.array(z.number()),
    weather_code: z.array(z.number()),
  }),
});

const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=-34.9011&longitude=-56.1645" +
  "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
  "&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=2&timezone=America%2FMontevideo";

/** Montevideo right now, from Open-Meteo (no key); cached 15 minutes. */
export const getWeather = () =>
  fetchJson("Open-Meteo", FORECAST_URL, ForecastSchema, { next: { revalidate: 900 } }).pipe(
    Effect.map(({ current, hourly }): StageWeather => {
      const start = hourly.time.findIndex((time) => time > current.time);

      return {
        temp: current.temperature_2m,
        feels: current.apparent_temperature,
        code: current.weather_code,
        wind: current.wind_speed_10m,
        hours: hourly.time.slice(start, start + 6).map((time, index) => ({
          time: time.slice(11, 16),
          temp: hourly.temperature_2m[start + index],
          rain: hourly.precipitation_probability[start + index],
          code: hourly.weather_code[start + index],
        })),
      };
    }),
    Effect.orElseSucceed((): StageWeather | null => null)
  );

// Placeholder entries the talks use for breaks and the open space block.
const NOT_PEOPLE = new Set(["carpincho", "coffe", "openspace", "el-cuervo"]);

/** Past speakers from the keystatic collection (the site's content folder). */
export const getSpeakers = () =>
  Effect.promise(async (): Promise<StageSpeaker[]> => {
    const { createReader } = await import("@keystatic/core/reader");
    const { default: keystaticConfig } = await import("../../../../keystatic.config");
    const entries = await createReader(process.cwd(), keystaticConfig).collections.speakers.all();

    return entries
      .filter((entry) => !NOT_PEOPLE.has(entry.slug))
      .map((entry) => ({
        slug: entry.slug,
        name: `${entry.entry.firstname} ${entry.entry.lastname}`.trim(),
        picture: entry.entry.picture ?? null,
        role: [entry.entry.jobTitle, entry.entry.company].filter(Boolean).join(" · ") || null,
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name));
  });
