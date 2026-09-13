import { createId } from "@paralleldrive/cuid2";
import { and, asc, count, eq } from "drizzle-orm";

import { EVENTBRITE_API_KEY, EVENTBRITE_API_URL, EVENTBRITE_EVENT_ID, EXTERNAL_SERVICES } from "app/lib/constants";
import type { EventbriteAttendeesResponse } from "lib/eventbrite/types";

import { db } from "../../../db";
import { owyStageInputs, owyStageState, rooms, tracks } from "../../../db/schema";
import {
  DEFAULT_STAGE_STATE,
  OWY_STAGE_CHANNEL,
  isSceneId,
  parseSceneParams,
  type InputEvent,
  type StageInput,
  type StageState,
  type SubmitInput,
} from "../../../owy-stage/scenes";
import { publishServer } from "../../../realtime/publish";
import type { FireEffectInput, SetFaceInput, SetNowPlayingInput, SetSceneInput } from "../schemas";

const ROW_ID = "global";

/**
 * What the wall is showing right now (persisted, so a freshly opened OBS
 * browser source starts on the right scene before any broadcast arrives).
 */
export async function getStageState(): Promise<StageState> {
  const [row] = await db.select().from(owyStageState).where(eq(owyStageState.id, ROW_ID)).limit(1);
  if (!row || !isSceneId(row.scene)) return DEFAULT_STAGE_STATE;

  return {
    scene: row.scene,
    params: row.params,
    eventId: row.eventId,
    round: row.round,
    takenAt: row.updatedAt.toISOString(),
  };
}

/** Persist the active scene (params validated against the scene's schema) and tell every stage. */
export async function setScene(input: SetSceneInput): Promise<StageState> {
  const params = parseSceneParams(input.scene, input.params) as Record<string, unknown>;
  const eventId = input.eventId === undefined ? (await getStageState()).eventId : input.eventId;
  const takenAt = new Date();
  const state: StageState = { scene: input.scene, params, eventId, round: createId(), takenAt: takenAt.toISOString() };

  await db
    .insert(owyStageState)
    .values({ id: ROW_ID, scene: state.scene, params, eventId, round: state.round, updatedAt: takenAt })
    .onConflictDoUpdate({
      target: owyStageState.id,
      set: { scene: state.scene, params, eventId, round: state.round, updatedAt: takenAt },
    });

  await publishServer(OWY_STAGE_CHANNEL, "scene", state);

  return state;
}

/**
 * A recogniser heard a song. Only touches the wall while `now-playing` is on
 * air (so a listener can run all day without hijacking other scenes) and only
 * when the song actually changed.
 */
export async function setNowPlaying(input: SetNowPlayingInput): Promise<{ applied: boolean }> {
  const state = await getStageState();
  if (state.scene !== "now-playing") return { applied: false };
  const params = parseSceneParams("now-playing", state.params) as { song: string; artist: string; playlist: string };
  if (params.song === input.song && params.artist === input.artist) return { applied: false };
  await setScene({
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
}

/** One-shot overlay (confetti, flash, caption…) — broadcast only, nothing to persist. */
export async function fireEffect(input: FireEffectInput): Promise<FireEffectInput> {
  await publishServer(OWY_STAGE_CHANNEL, "effect", input);

  return input;
}

/**
 * Owy's face state + running transcript, pushed by the companion bridge (or the
 * admin simulator) so the wall's Owy mirrors whoever is talking to it.
 */
export async function setFace(input: SetFaceInput): Promise<SetFaceInput> {
  await publishServer(OWY_STAGE_CHANNEL, "face", input);

  return input;
}

// ---------------------------------------------------------------------------
// Phone inputs (/owy/play)
// ---------------------------------------------------------------------------

/**
 * Store one answer and tell the wall. `single` keeps the person's latest value,
 * `once` keeps their first, `multi` keeps every one. Rejected when the wall has
 * moved on to another round.
 */
export async function submitInput(input: SubmitInput): Promise<{ ok: boolean; id?: string }> {
  const state = await getStageState();
  if (!state.round || state.round !== input.round) return { ok: false };
  // ponytail: no rate limit beyond one row per (round, key, voter, slot); add a per-voter cap if the wall gets spammed.
  const row = {
    round: input.round,
    key: input.key,
    value: input.value,
    voter: input.voter,
    slot: input.mode === "multi" ? createId() : "",
  };
  const target = [owyStageInputs.round, owyStageInputs.key, owyStageInputs.voter, owyStageInputs.slot];
  const [saved] =
    input.mode === "once"
      ? await db.insert(owyStageInputs).values(row).onConflictDoNothing({ target }).returning()
      : await db
          .insert(owyStageInputs)
          .values(row)
          .onConflictDoUpdate({ target, set: { value: input.value, createdAt: new Date() } })
          .returning();
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
  await publishServer(OWY_STAGE_CHANNEL, "input", event);

  return { ok: true, id: saved.id };
}

/** Everything sent during a round, oldest first (capped; the wall aggregates). */
export async function getInputs(round: string): Promise<StageInput[]> {
  if (!round) return [];
  const rows = await db
    .select()
    .from(owyStageInputs)
    .where(eq(owyStageInputs.round, round))
    .orderBy(asc(owyStageInputs.createdAt))
    .limit(3000);

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    voter: row.voter,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Public reads for the data-driven scenes
// ---------------------------------------------------------------------------

export type StagePulse = {
  /** Aggregates only — never attendee data. `null` when Eventbrite isn't configured. */
  tickets: { checkedIn: number; active: number; capacity: number | null } | null;
  board: { ideas: number; rooms: number } | null;
};

/** Walks every attendee page and counts; Eventbrite caps pages at 100 rows. */
async function countTickets(): Promise<StagePulse["tickets"]> {
  if (!EVENTBRITE_API_KEY || !EVENTBRITE_EVENT_ID) return null;
  const headers = { Authorization: `Bearer ${EVENTBRITE_API_KEY}` };
  const eventResponse = await fetch(`${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}/`, {
    headers,
    next: { revalidate: 300 },
  });
  const event = eventResponse.ok ? ((await eventResponse.json()) as { capacity?: number }) : {};

  let checkedIn = 0;
  let active = 0;
  for (let page = 1; page <= 30; page++) {
    const response = await fetch(
      `${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}/attendees/?page_size=100&page=${page}`,
      { headers, next: { revalidate: 60 } }
    );
    if (!response.ok) break;
    const data = (await response.json()) as EventbriteAttendeesResponse;
    for (const attendee of data.attendees) {
      if (attendee.cancelled || attendee.refunded) continue;
      active++;
      if (attendee.checked_in) checkedIn++;
    }
    if (!data.pagination.has_more_items) break;
  }

  return { checkedIn, active, capacity: event.capacity ?? null };
}

export async function getStagePulse(eventId?: string | null): Promise<StagePulse> {
  const [tickets, board] = await Promise.all([
    countTickets().catch((error) => {
      console.error("[stage] eventbrite pulse", error);
      return null;
    }),
    eventId
      ? Promise.all([
          db.select({ count: count() }).from(tracks).where(eq(tracks.openSpaceId, eventId)),
          db
            .select({ count: count() })
            .from(rooms)
            .where(and(eq(rooms.openSpaceId, eventId), eq(rooms.isActive, true))),
        ]).then(([[ideas], [activeRooms]]) => ({ ideas: ideas.count, rooms: activeRooms.count }))
      : Promise.resolve(null),
  ]);

  return { tickets, board };
}

export type StageMeetup = { name: string; title: string; datetime: string; venue: string | null; url: string };

/** The community calendar (meetup-bot feed); the browser can't read it directly (no CORS). */
export async function getStageMeetups(): Promise<StageMeetup[]> {
  const response = await fetch(EXTERNAL_SERVICES.meetupBot, { next: { revalidate: 1800 } });
  if (!response.ok) return [];
  const { meetups } = (await response.json()) as {
    meetups: { name: string; title: string; datetime: string; venue?: string | null; event_url: string }[];
  };
  const now = Date.now();

  return meetups
    .filter((meetup) => new Date(meetup.datetime).getTime() > now - 3_600_000)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .slice(0, 8)
    .map((meetup) => ({
      name: meetup.name,
      title: meetup.title,
      datetime: meetup.datetime,
      venue: meetup.venue ?? null,
      url: meetup.event_url,
    }));
}

export type StageWeather = {
  temp: number;
  feels: number;
  code: number;
  wind: number;
  hours: { time: string; temp: number; rain: number; code: number }[];
};

/** Montevideo right now, from Open-Meteo (no key); cached 15 minutes. */
export async function getStageWeather(): Promise<StageWeather | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=-34.9011&longitude=-56.1645" +
    "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
    "&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=2&timezone=America%2FMontevideo";
  const response = await fetch(url, { next: { revalidate: 900 } });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    current: {
      time: string;
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
    };
    hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  };
  const start = data.hourly.time.findIndex((time) => time > data.current.time);
  const hours = data.hourly.time.slice(start, start + 6).map((time, i) => ({
    time: time.slice(11, 16),
    temp: data.hourly.temperature_2m[start + i],
    rain: data.hourly.precipitation_probability[start + i],
    code: data.hourly.weather_code[start + i],
  }));
  return {
    temp: data.current.temperature_2m,
    feels: data.current.apparent_temperature,
    code: data.current.weather_code,
    wind: data.current.wind_speed_10m,
    hours,
  };
}

export type StageSpeaker = { slug: string; name: string; picture: string | null; role: string | null };

// Placeholder entries the talks use for breaks and the open space block.
const NOT_PEOPLE = new Set(["carpincho", "coffe", "openspace", "el-cuervo"]);

/** Past speakers from the keystatic collection (the site's content folder). */
export async function getStageSpeakers(): Promise<StageSpeaker[]> {
  const { createReader } = await import("@keystatic/core/reader");
  const { default: keystaticConfig } = await import("../../../../../keystatic.config");
  const entries = await createReader(process.cwd(), keystaticConfig).collections.speakers.all();
  return entries
    .filter((entry) => !NOT_PEOPLE.has(entry.slug))
    .map((entry) => ({
      slug: entry.slug,
      name: `${entry.entry.firstname} ${entry.entry.lastname}`.trim(),
      picture: entry.entry.picture ?? null,
      role: [entry.entry.jobTitle, entry.entry.company].filter(Boolean).join(" · ") || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
