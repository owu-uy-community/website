import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import { cacheLife } from "next/cache";
import * as z from "zod";

import { EXTERNAL_SERVICES } from "app/lib/constants";

import { attendees, communities, events, owyStageInputs, owyStageState, user } from "../../db/schema";
import { publicBoard } from "../../openspace/public-board";
import { photoPreference } from "../../organizar/presets";
import { afterTake, cue, findPreset, presetStep, readDesk } from "../../owy-stage/desk";
import {
  DEFAULT_STAGE_STATE,
  OWY_DESK_CHANNEL,
  OWY_STAGE_CHANNEL,
  RundownStepSchema,
  SCENES,
  StoredFaceSchema,
  isSceneId,
  parseSceneParams,
  type Desk,
  type DeskStep,
  type FaceEvent,
  type InputEvent,
  type Moderation,
  type ModerationEvent,
  type RundownStep,
  type SceneId,
  type Spotlight,
  type StageInput,
  type StageState,
  type StageTransition,
  type StoredFace,
  type SubmitInput,
} from "../../owy-stage/scenes";
import * as Attendees from "../attendees/service";
import { query, transaction } from "../db";
import { Invalid, NotFound } from "../errors";
import { shortName } from "../events/service";
import { fetchJson } from "../http";
import { later } from "../../later";
import { OWY_TALK_CHANNEL } from "../../realtime/channels";
import { Realtime, type AppServices } from "../services";
import type { StickyNote } from "../tracks/schemas";
import type {
  SaveDeskInput,
  SeatStatus,
  SetNowPlayingInput,
  SetSceneInput,
  StageArrival,
  StageCommunity,
  StageMeetup,
  StagePulse,
  StageSpeaker,
  StageWeather,
  TalkCommand,
} from "./schemas";

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

const broadcast = (event: string, payload: unknown, channel = OWY_STAGE_CHANNEL) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(channel, event, payload);
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
 * The part of a take that runs inside a transaction, with the row locked so a
 * take and an edit at once can't interleave. Returns what went on air and
 * what was on air before.
 */
const putOnAir = (input: SetSceneInput) =>
  Effect.gen(function* () {
    const params = yield* sceneParams(input.scene, input.params);
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
    const state = {
      scene: input.scene,
      params,
      eventId,
      round,
      takenAt: takenAt.toISOString(),
      face: current.face,
      ...(input.transition ? { transition: input.transition } : {}),
    } satisfies StageState;

    return { state, before: current };
  });

/**
 * Persist the active scene (params validated against the scene's schema) and
 * tell every stage. The `round` marks a scene *going on air*: editing the
 * params of what is already up keeps it, so phone answers and running timers
 * survive a live edit; `restart` (what the library's take sends) mints a new
 * one.
 */
export const setScene = (input: SetSceneInput) =>
  Effect.gen(function* () {
    const { state } = yield* transaction(putOnAir(input));
    yield* broadcast("scene", state);

    return state;
  });

// ---------------------------------------------------------------------------
// The desk: preview, queue and presets (admin devices only)
// ---------------------------------------------------------------------------

/** The stored desk. `lock` holds the row until the transaction ends, so a TAKE can't land in between. */
const readStoredDesk = (lock = false) =>
  query((db) => {
    const select = db.select({ desk: owyStageState.desk }).from(owyStageState).where(eq(owyStageState.id, ROW_ID));

    return lock ? select.for("update") : select;
  }).pipe(Effect.map(([row]) => readDesk(row?.desk)));

/**
 * Not a take: `updatedAt` stays (phones time their rounds off it), like the rundown. Merged over
 * the stored desk, so what rides along in it (the autopilot) stays.
 */
const writeDesk = (desk: Desk) =>
  query((db) =>
    db
      .insert(owyStageState)
      .values({ id: ROW_ID, desk })
      .onConflictDoUpdate({
        target: owyStageState.id,
        set: { desk: sql`${owyStageState.desk} || excluded."desk"`, updatedAt: sql`${owyStageState.updatedAt}` },
      })
  );

/**
 * Just the preview and the queue, merged into the stored desk in one statement: the presets stay as
 * stored, even when another device saves one at the same moment. Returns the desk as it now is.
 */
const writeDeskSteps = (steps: Pick<Desk, "preview" | "queue">) =>
  query((db) =>
    db
      .insert(owyStageState)
      .values({ id: ROW_ID, desk: steps })
      .onConflictDoUpdate({
        target: owyStageState.id,
        set: {
          desk: sql`${owyStageState.desk} || ${JSON.stringify(steps)}::jsonb`,
          updatedAt: sql`${owyStageState.updatedAt}`,
        },
      })
      .returning({ desk: owyStageState.desk })
  ).pipe(Effect.map(([row]) => readDesk(row?.desk)));

/**
 * ponytail: desk tabs opened before presets existed read `favorites` and break without it, so every
 * desk that leaves the server names the presets' scenes that way too. Drop it after OWU CONF.
 */
const wire = (desk: Desk) => ({ ...desk, favorites: [...new Set(desk.presets.map((preset) => preset.scene))] });

export const getDesk = () => readStoredDesk().pipe(Effect.map(wire));

/**
 * Replace the desk and tell the other admin devices. The presets only come with a preset edit: any
 * other save leaves the stored ones alone, so a device that missed a preset saved elsewhere (or a
 * tab opened before presets existed) can't bring back its older list.
 */
export const saveDesk = (input: SaveDeskInput) =>
  Effect.gen(function* () {
    const { preview, queue, presets } = input;
    const desk: Desk = presets ? { preview, queue, presets } : yield* writeDeskSteps({ preview, queue });
    if (presets) yield* writeDesk(desk);
    yield* broadcast("desk", wire(desk), OWY_DESK_CHANNEL);

    return wire(desk);
  });

/**
 * A preset fired from outside the desk (a Stream Deck): into preview, where
 * TAKE sends it, or straight on air like «Al aire ya». `ref` is its id or its
 * number on the desk.
 */
export const firePreset = (ref: string, to: "preview" | "air") =>
  Effect.gen(function* () {
    const missing = new NotFound({ entity: "preset", message: `No hay un preset «${ref}» en el desk` });
    if (to === "air") {
      const preset = findPreset((yield* readStoredDesk()).presets, ref);
      if (!preset) return yield* Effect.fail(missing);
      yield* setScene({ scene: preset.scene, params: preset.params, restart: true });

      return { preset, to };
    }

    const { preset, desk } = yield* transaction(
      Effect.gen(function* () {
        const current = yield* readStoredDesk(true);
        const preset = findPreset(current.presets, ref);
        if (!preset) return yield* Effect.fail(missing);
        const desk = cue(current, presetStep(preset, createId()));
        yield* writeDesk(desk);

        return { preset, desk };
      })
    );
    yield* broadcast("desk", wire(desk), OWY_DESK_CHANNEL);

    return { preset, to };
  });

/**
 * TAKE (or CUT, with `transition: "cut"`): the step the operator sees in
 * preview goes on air from scratch (new round), and in the same transaction the queue moves up — or, with nothing
 * queued, the scene that just left comes back to preview, so TAKE again
 * undoes. The step travels in the request, so what goes out is exactly what
 * the operator was looking at, even if its last edit hadn't been saved yet.
 */
export const take = (step: DeskStep, transition?: StageTransition) =>
  Effect.gen(function* () {
    const { state, desk } = yield* transaction(
      Effect.gen(function* () {
        const { state, before } = yield* putOnAir({
          scene: step.scene,
          params: step.params,
          restart: true,
          transition,
        });
        const desk = afterTake(yield* readStoredDesk(), before, createId());
        yield* writeDesk(desk);

        return { state, desk };
      })
    );
    yield* broadcast("scene", state);
    yield* broadcast("desk", wire(desk), OWY_DESK_CHANNEL);

    return { state, desk: wire(desk) };
  });

// ---------------------------------------------------------------------------
// Spotlights and the autopilot: new talks on «Owy y la grilla»
// ---------------------------------------------------------------------------

const autopilotOf = (desk: unknown) =>
  Boolean(desk && typeof desk === "object" && (desk as { autopilot?: unknown }).autopilot === true);

/** Whether a new talk brings the wall to «Owy y la grilla» on its own. */
export const getAutopilot = () =>
  query((db) => db.select({ desk: owyStageState.desk }).from(owyStageState).where(eq(owyStageState.id, ROW_ID))).pipe(
    Effect.map(([row]) => ({ on: autopilotOf(row?.desk) }))
  );

/** Switch the autopilot; kept in the desk's JSON, merged in, so the desk itself is left alone. */
export const setAutopilot = (on: boolean) =>
  Effect.gen(function* () {
    yield* query((db) =>
      db
        .insert(owyStageState)
        .values({ id: ROW_ID, desk: { preview: null, queue: [], presets: [], autopilot: on } })
        .onConflictDoUpdate({
          target: owyStageState.id,
          set: {
            desk: sql`${owyStageState.desk} || ${JSON.stringify({ autopilot: on })}::jsonb`,
            updatedAt: sql`${owyStageState.updatedAt}`,
          },
        })
    );
    yield* broadcast("autopilot", { on }, OWY_DESK_CHANNEL);

    return { on };
  });

/** What the spotlight needs to know about the wall: what is on air, for which event, the autopilot. */
const wallNow = () =>
  query((db) =>
    db
      .select({
        scene: owyStageState.scene,
        params: owyStageState.params,
        eventId: owyStageState.eventId,
        desk: owyStageState.desk,
      })
      .from(owyStageState)
      .where(eq(owyStageState.id, ROW_ID))
  ).pipe(Effect.map(([row]) => row));

/** «Owy y la grilla» on air for the talk's event; from «Owy» it keeps the captions setting (and morphs in place). */
const bringBoard = (wall: { scene: string; params: Record<string, unknown> } | undefined, note: StickyNote) =>
  Effect.gen(function* () {
    if (wall?.scene === "owy-board") return;
    const captions =
      wall?.scene === "owy-face" ? SCENES["owy-face"].params.safeParse(wall.params).data?.captions : undefined;
    yield* setScene({
      scene: "owy-board",
      params: captions === undefined ? {} : { captions },
      eventId: note.openSpaceId,
    });
  });

/** The spotlight itself (SpotlightSchema), on the public stage channel: only what the board already shows. */
const shine = (note: StickyNote, how: Spotlight["how"]) =>
  Effect.gen(function* () {
    const spot: Spotlight = {
      id: createId(),
      how,
      track: {
        id: note.id,
        title: note.title,
        speaker: note.speaker,
        room: note.room,
        timeSlot: note.timeSlot,
        roomId: note.roomId,
        scheduleId: note.scheduleId,
        roomColor: note.roomColor,
      },
    };
    yield* broadcast("spotlight", spot);

    return spot;
  });

/**
 * The operator picked a talk: «Owy y la grilla» comes up if the wall shows something else, puts it
 * up big over the blurred grid and sends it back to its cell.
 */
export const spotlightTalk = (note: StickyNote) =>
  Effect.gen(function* () {
    yield* bringBoard(yield* wallNow(), note);

    return yield* shine(note, "manual");
  });

/**
 * A talk just landed on the board: «Owy y la grilla» shows it if it is on air, and with the
 * autopilot on, the wall goes there first. A talk of another event than the wall's is none of the
 * wall's business.
 */
export const announceNewTalk = (note: StickyNote) =>
  Effect.gen(function* () {
    const wall = yield* wallNow();
    if (wall?.eventId && wall.eventId !== note.openSpaceId) return;
    if (autopilotOf(wall?.desk)) yield* bringBoard(wall, note);
    yield* shine(note, "new");
  });

/**
 * The wall hears about a new talk after the response (spotlight, autopilot): never in the way of
 * the write. Called by the routes that create talks (a service import would close a cycle through
 * the public board).
 */
export const announceSoon = (note: StickyNote) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<AppServices>();
    later(() =>
      Effect.runPromiseWith(services)(announceNewTalk(note)).catch((error: unknown) =>
        console.warn("[owy-stage] the wall missed a new talk", error)
      )
    );
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
      moderation: saved.moderation,
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
            moderation: row.moderation,
          }))
        )
      )
    : Effect.succeed([]);

/**
 * Hide, pin or mark answered a question from the phones, and tell everyone following the round:
 * the wall re-ranks, the phones drop what was hidden. Only questions are moderated, never votes.
 */
export const moderate = ({ inputId, moderation }: { inputId: string; moderation: Moderation }) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .update(owyStageInputs)
        .set({ moderation })
        .where(and(eq(owyStageInputs.id, inputId), eq(owyStageInputs.key, "question")))
        .returning({ id: owyStageInputs.id, round: owyStageInputs.round, moderation: owyStageInputs.moderation })
    );
    if (!row) return yield* Effect.fail(new NotFound({ entity: "question", message: "Esa pregunta ya no existe" }));
    const event: ModerationEvent = row;
    yield* broadcast("moderation", event);

    return event;
  });

// ---------------------------------------------------------------------------
// Public reads for the data-driven scenes. External feeds degrade to empty.
// ---------------------------------------------------------------------------

/** Ticket counts over every attendee page. */
/**
 * The wall's «Ya somos N»: the event's own attendees, the rows the door scans and the Eventbrite
 * mirror keep current (so it agrees with the door's dashboard), and the board from the shared cache.
 * Aggregates only. `tickets` is null for an event with nobody registered.
 */
export const getPulse = (eventId: string | null | undefined) =>
  eventId
    ? Effect.all(
        [
          query((db) =>
            db
              .select({
                checkedIn: sql<number>`(count(*) filter (where ${attendees.checkedInAt} is not null))::int`,
                active: sql<number>`(count(*) filter (where ${attendees.status} = 'attending'))::int`,
              })
              .from(attendees)
              .where(eq(attendees.eventId, eventId))
          ),
          query((db) => db.select({ capacity: events.capacity }).from(events).where(eq(events.id, eventId))),
          Effect.promise(() => publicBoard(eventId)),
        ],
        { concurrency: "unbounded" }
      ).pipe(
        Effect.map(([[people], [event], board]): StagePulse => ({
          tickets:
            people && (people.active > 0 || people.checkedIn > 0)
              ? { checkedIn: people.checkedIn, active: people.active, capacity: event?.capacity ?? null }
              : null,
          board: { ideas: board.tracks.length, rooms: board.rooms.filter((room) => room.isActive).length },
        }))
      )
    : Effect.succeed<StagePulse>({ tickets: null, board: null });

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

/**
 * The feeds below come from a cache every server instance shares, refreshed in the background and
 * never older than its expiry: the fetch cache they used before had no ceiling, so the first read
 * after a quiet night served the evening before. A failed read throws, so it is never cached.
 */
async function meetupFeed() {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 1800, expire: 6 * 3600 });

  return Effect.runPromise(fetchJson("meetup-bot", EXTERNAL_SERVICES.meetupBot, MeetupFeedSchema));
}

/** The community calendar (meetup-bot feed); the browser can't read it directly (no CORS). */
export const getMeetups = () =>
  Effect.tryPromise(() => meetupFeed()).pipe(
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

async function forecast() {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });

  return Effect.runPromise(fetchJson("Open-Meteo", FORECAST_URL, ForecastSchema));
}

/** Montevideo right now, from Open-Meteo (no key): refreshed every 15 minutes, never over an hour old. */
export const getWeather = () =>
  Effect.tryPromise(() => forecast()).pipe(
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

/** An attendee tag that keeps someone off the welcome wall, as the door's photo chip says it. */
const NO_PHOTOS_TAG = "sin fotos";

/** The event on the wall: the only one whose arrivals the public reads below show. */
const wallEvent = query((db) =>
  db.select({ eventId: owyStageState.eventId }).from(owyStageState).where(eq(owyStageState.id, ROW_ID))
).pipe(Effect.map(([row]) => row?.eventId ?? null));

/**
 * Who has checked in to an event, oldest first, minus anyone tagged «sin fotos» or who answered
 * "No" to the RSVP's photo question. `only` narrows it to one attendee (the avatar route).
 */
const arrivals = (eventId: string, only?: string) =>
  query((db) =>
    db
      .select({
        id: attendees.id,
        name: attendees.name,
        email: attendees.email,
        at: attendees.checkedInAt,
        tags: attendees.tags,
        answers: attendees.answers,
        questions: events.questions,
        // Their OWU account's picture (the Slack one), when the ticket's email has an account
        image: user.image,
      })
      .from(attendees)
      .innerJoin(events, eq(events.id, attendees.eventId))
      .leftJoin(user, sql`lower(${user.email}) = lower(${attendees.email})`)
      .where(
        and(eq(attendees.eventId, eventId), isNotNull(attendees.checkedInAt), only ? eq(attendees.id, only) : undefined)
      )
      .orderBy(asc(attendees.checkedInAt), asc(attendees.id))
  ).pipe(
    Effect.map((rows) =>
      rows.filter(
        (row) =>
          photoPreference(row.questions, row.answers) !== "Sin fotos" &&
          !row.tags.some((tag) => tag.trim().toLowerCase() === NO_PHOTOS_TAG)
      )
    )
  );

/**
 * The welcome wall: who has arrived at the wall's event, as "Ana G." (pictures go through
 * /api/owy-stage/avatar/<id>, so no email leaves the server). The wall asks every 30 s, so like an
 * open door screen it keeps the Eventbrite mirror current (throttled per event): check-ins made
 * in Eventbrite Organizer reach it too.
 */
export const getArrivals = () =>
  Effect.gen(function* () {
    const eventId = yield* wallEvent;
    if (!eventId) return [];
    yield* Effect.ignoreCause(Attendees.sync(eventId, false));

    return (yield* arrivals(eventId)).map((row): StageArrival => ({
      id: row.id,
      name: shortName(row.name),
      at: row.at?.toISOString() ?? "",
    }));
  });

/** Where one wall tile's picture may come from: only for someone the wall shows. */
export const arrivalAvatar = (id: string) =>
  Effect.gen(function* () {
    const eventId = yield* wallEvent;
    const [row] = eventId ? yield* arrivals(eventId, id) : [];

    return row ? { email: row.email, image: row.image } : null;
  });

/** The groups on /comunidades: listed and active, the same rows the public directory reads. */
export const getCommunities = () =>
  query((db) =>
    db
      .select({ slug: communities.slug, name: communities.name, logo: communities.logoUrl })
      .from(communities)
      .where(and(eq(communities.listed, true), eq(communities.isActive, true)))
  ).pipe(Effect.map((rows): StageCommunity[] => rows.toSorted((a, b) => a.name.localeCompare(b.name, "es"))));

// ---------------------------------------------------------------------------
// «Owy, en vivo»: broadcast-only relay between the presenter's phone and the Mac seat
// ---------------------------------------------------------------------------

/** A phone's command for the seat. Nothing is stored: with no seat listening it is simply gone. */
export const talkCommand = (command: TalkCommand) =>
  broadcast("command", command, OWY_TALK_CHANNEL).pipe(Effect.as({ ok: true as const }));

/** The seat's heartbeat, stamped with the server's clock so every phone ages it the same way. */
export const talkStatus = (status: SeatStatus) =>
  broadcast("status", { ...status, at: new Date().toISOString() }, OWY_TALK_CHANNEL).pipe(
    Effect.as({ ok: true as const })
  );
